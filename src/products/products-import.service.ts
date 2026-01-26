import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import { SettingsService } from '../settings/settings.service';

export interface ImportItem {
    sku: string;
    name_xml: string;
    quantity_xml: number;
    cost_price_xml: number;
    existing_product?: { id: number; name: string; current_stock: number } | null;
    action: 'UPDATE_STOCK' | 'CREATE_NEW';
}

@Injectable()
export class ProductsImportService {
    constructor(
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
        private readonly settingsService: SettingsService,
    ) { }

    async parseNfe(fileBuffer: Buffer) {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
        });

        const xmlString = fileBuffer.toString('utf-8');
        const jsonObj = parser.parse(xmlString);

        let nfeNode = jsonObj.nfeProc?.NFe || jsonObj.NFe;
        if (!nfeNode) {
            throw new Error('Formato de NFe inválido (nfeProc ou NFe não encontrado)');
        }

        const infNFe = nfeNode.infNFe;
        let dets = infNFe.det;

        if (!Array.isArray(dets)) {
            dets = [dets];
        }

        const rawItems = dets.map(det => ({
            sku: String(det.prod.cProd || ''),
            name: det.prod.xProd || 'Produto sem nome',
            quantity: parseFloat(det.prod.qCom) || 0,
            costPrice: parseFloat(det.prod.vUnCom) || 0,
        }));

        const items = await this.enrichItemsWithExisting(rawItems);

        return {
            nfeId: infNFe['@_Id'] || 'unknown',
            totalItems: items.length,
            items
        };
    }

    async parseXlsx(fileBuffer: Buffer) {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Encontrar a linha de cabeçalho
        let headerRowIndex = -1;
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row && row.some(cell => typeof cell === 'string' && (cell.includes('CÓD. PROD') || cell.includes('DESCRIÇÃO')))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            throw new Error('Não foi possível encontrar o cabeçalho dos produtos na planilha. Verifique se as colunas CÓD. PROD. e DESCRIÇÃO existem.');
        }

        const headers = data[headerRowIndex];
        const skuIdx = headers.findIndex(h => h && String(h).includes('CÓD. PROD'));
        const nameIdx = headers.findIndex(h => h && String(h).includes('DESCRIÇÃO'));
        const qtyIdx = headers.findIndex(h => h && String(h).includes('QUANT'));
        const priceIdx = headers.findIndex(h => h && String(h).includes('V. UNIT'));

        const rawItems: { sku: string; name: string; quantity: number; costPrice: number }[] = [];
        const rows = data.slice(headerRowIndex + 1);

        for (const row of rows) {
            const sku = row[skuIdx] ? String(row[skuIdx]).trim() : '';
            if (!sku || sku === 'TOTAL') continue; // Ignora rows vazias ou de rodapé

            rawItems.push({
                sku,
                name: String(row[nameIdx] || 'Produto sem nome').trim(),
                quantity: parseFloat(row[qtyIdx]) || 0,
                costPrice: parseFloat(row[priceIdx]) || 0,
            });
        }

        const items = await this.enrichItemsWithExisting(rawItems);

        return {
            nfeId: 'XLSX_IMPORT',
            totalItems: items.length,
            items
        };
    }

    private async enrichItemsWithExisting(rawItems: { sku: string; name: string; quantity: number; costPrice: number }[]): Promise<ImportItem[]> {
        const items: ImportItem[] = [];

        for (const raw of rawItems) {
            const { data: existing } = await this.supabase
                .from('products')
                .select('id, name, current_stock')
                .eq('sku', raw.sku)
                .maybeSingle();

            items.push({
                sku: raw.sku,
                name_xml: raw.name,
                quantity_xml: raw.quantity,
                cost_price_xml: raw.costPrice,
                existing_product: existing as { id: number; name: string; current_stock: number } | null,
                action: existing ? 'UPDATE_STOCK' : 'CREATE_NEW'
            });
        }

        return items;
    }

    async processImport(items: ImportItem[]) {
        const results = { updated: 0, created: 0, errors: 0 };

        for (const item of items) {
            try {
                if (item.action === 'UPDATE_STOCK' && item.existing_product) {
                    const { error } = await this.supabase
                        .from('products')
                        .update({
                            current_stock: item.existing_product.current_stock + item.quantity_xml,
                        })
                        .eq('id', item.existing_product.id);

                    if (error) throw error;
                    results.updated++;

                } else if (item.action === 'CREATE_NEW') {
                    const priceMultiplier = await this.settingsService.getNumber('import_price_multiplier', 2.0);
                    const { error } = await this.supabase
                        .from('products')
                        .insert({
                            sku: item.sku,
                            name: item.name_xml,
                            current_stock: item.quantity_xml,
                            cost_price: item.cost_price_xml,
                            price: item.cost_price_xml * priceMultiplier,
                            description: 'Importado de Planilha/XML',
                            is_active: true
                        });

                    if (error) throw error;
                    results.created++;
                }
            } catch (err) {
                console.error(`Error processing item ${item.sku}:`, err);
                results.errors++;
            }
        }

        return results;
    }
}

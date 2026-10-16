import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmImportDto } from './confirm-import.dto';

const item = { is_new: false, product_id: 5, quantity: 1, unit_cost: 20 };

const errorsFor = async (extra: Record<string, unknown>) =>
  validate(plainToInstance(ConfirmImportDto, { items: [item], ...extra }));

describe('ConfirmImportDto.supplier_id', () => {
  it('is optional (old screens keep importing as Zarpellon)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts a supplier id', async () => {
    expect(await errorsFor({ supplier_id: 3 })).toHaveLength(0);
  });

  it.each([0, -1, 2.5, '3', 'alinare'])('rejects %p', async (supplier_id) => {
    const errors = await errorsFor({ supplier_id });
    expect(errors.map((e) => e.property)).toContain('supplier_id');
  });
});

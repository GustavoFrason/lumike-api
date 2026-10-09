import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadImageDto } from './upload-image.dto';

const errorsFor = async (folder: unknown) =>
  validate(plainToInstance(UploadImageDto, { folder }));

describe('UploadImageDto', () => {
  it.each(['123', 'categorias', 'banners'])(
    'accepts folder "%s"',
    async (f) => {
      expect(await errorsFor(f)).toHaveLength(0);
    },
  );

  it.each(['../etc', '1/../../x', 'outra-pasta', '', '12a'])(
    'rejects folder "%s"',
    async (f) => {
      expect(await errorsFor(f)).not.toHaveLength(0);
    },
  );
});

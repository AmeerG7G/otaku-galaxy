import { config } from '../src/config/index.js';
import { db, closePools } from '../src/database/pool.js';
import { runMigrations } from './migrate.js';
import bcrypt from 'bcryptjs';

const CATEGORIES = [
  { name: 'ملابس', imageUrl: '' },
  { name: 'قرطاسية', imageUrl: '' },
  { name: 'حقائب', imageUrl: '' },
  { name: 'إكسسوارات', imageUrl: '' },
];

const SUBCATEGORIES: Record<string, string[]> = {
  'ملابس': ['تيشيرتات', 'هوديز', 'قبعات'],
  'قرطاسية': ['دفاتر', 'أقلام', 'ملصقات'],
  'حقائب': ['ظهرية', 'قماشية'],
  'إكسسوارات': ['سلاسل', 'خواتم', 'بروشات'],
};

const GOVERNORATES = [
  { name: 'بغداد', deliveryFee: 4000 },
  { name: 'البصرة', deliveryFee: 5000 },
  { name: 'نينوى', deliveryFee: 5000 },
  { name: 'أربيل', deliveryFee: 5000 },
  { name: 'النجف', deliveryFee: 4000 },
  { name: 'كربلاء', deliveryFee: 4000 },
  { name: 'ديالى', deliveryFee: 4000 },
  { name: 'ذي قار', deliveryFee: 4500 },
  { name: 'الأنبار', deliveryFee: 4500 },
  { name: 'كردستان', deliveryFee: 5500 },
];

const img = (label: string) => `https://placehold.co/600x600/e91e63/ffffff?text=${label}`;

const PRODUCTS: {
  name: string;
  description: string;
  price: number;
  category: string;
  subcategory: string;
  stock: number;
  isOffer: boolean;
  isSelected: boolean;
  images: string[];
  options: { name: string; values: string[] }[];
}[] = [
  { name: 'تيشيرت ناروتو أسود', description: 'تيشيرت قطني بقصة ناروتو المميزة.', price: 20000, category: 'ملابس', subcategory: 'تيشيرتات', stock: 30, isOffer: true, isSelected: true, images: [img('naruto')], options: [{ name: 'المقاس', values: ['S', 'M', 'L', 'XL'] }] },
  { name: 'هودي ون بيس', description: 'هودي شتوي بطبعة ون بيس.', price: 45000, category: 'ملابس', subcategory: 'هوديز', stock: 20, isOffer: false, isSelected: true, images: [img('onepiece')], options: [{ name: 'المقاس', values: ['M', 'L', 'XL'] }] },
  { name: 'قبعة بيكاتشو', description: 'قبعة كاجوال بشعار بوكيمون.', price: 12000, category: 'ملابس', subcategory: 'قبعات', stock: 40, isOffer: true, isSelected: false, images: [img('pikachu')], options: [] },
  { name: 'دفتر أنمي مقاس A5', description: 'دفتر 100 ورقة بغلاف أنمي.', price: 8000, category: 'قرطاسية', subcategory: 'دفاتر', stock: 80, isOffer: false, isSelected: true, images: [img('notebook')], options: [{ name: 'عدد الأوراق', values: ['80', '120'] }] },
  { name: 'قلم بوكيمون', description: 'قلم حبر جاف بتصميم بوكيمون.', price: 3000, category: 'قرطاسية', subcategory: 'أقلام', stock: 150, isOffer: true, isSelected: false, images: [img('pen')], options: [] },
  { name: 'ملصقات جدارية أنمي', description: 'مجموعة 10 ملصقات متنوعة.', price: 6000, category: 'قرطاسية', subcategory: 'ملصقات', stock: 60, isOffer: false, isSelected: false, images: [img('stickers')], options: [] },
  { name: 'حقيبة ظهر ناروتو', description: 'حقيبة ظهر عملية بتصميم المعلمة.', price: 35000, category: 'حقائب', subcategory: 'ظهرية', stock: 25, isOffer: true, isSelected: true, images: [img('bag')], options: [] },
  { name: 'حقيبة قماشية أنمي', description: 'حقيبة قماشية خفيفة بتصميم أنمي.', price: 10000, category: 'حقائب', subcategory: 'قماشية', stock: 50, isOffer: false, isSelected: false, images: [img('tote')], options: [] },
  { name: 'سلسلة مفاتيح بيرسونا', description: 'سلسلة معدنية عالية الجودة.', price: 7000, category: 'إكسسوارات', subcategory: 'سلاسل', stock: 0, isOffer: false, isSelected: true, images: [img('keychain')], options: [{ name: 'التصميم', values: ['بيرسونا 1', 'بيرسونا 2'] }] },
  { name: 'خاتم فضة أنمي', description: 'خاتم بتصميم ياباني.', price: 15000, category: 'إكسسوارات', subcategory: 'خواتم', stock: 35, isOffer: false, isSelected: false, images: [img('ring')], options: [{ name: 'المقاس', values: ['18', '19', '20'] }] },
  { name: 'بروش شعار أنمي', description: 'بروش معدني يلمع.', price: 5000, category: 'إكسسوارات', subcategory: 'بروشات', stock: 45, isOffer: true, isSelected: false, images: [img('pin')], options: [] },
  { name: 'تيشيرت جوجوتسو كايسن', description: 'تيشيرت قطني بقصة جوجوتسو.', price: 22000, category: 'ملابس', subcategory: 'تيشيرتات', stock: 18, isOffer: false, isSelected: false, images: [img('jjk')], options: [{ name: 'المقاس', values: ['S', 'M', 'L'] }] },
  { name: 'هودي ديمون سلاير', description: 'هودي بتصميم تنغيرين.', price: 48000, category: 'ملابس', subcategory: 'هوديز', stock: 12, isOffer: true, isSelected: false, images: [img('demon')], options: [{ name: 'المقاس', values: ['M', 'L'] }] },
  { name: 'قبعة لوفي', description: 'قبعة القش الشهيرة.', price: 14000, category: 'ملابس', subcategory: 'قبعات', stock: 22, isOffer: false, isSelected: true, images: [img('luffy')], options: [] },
  { name: 'دفتر سبيستون', description: 'دفتر حكايات ورسومات.', price: 9000, category: 'قرطاسية', subcategory: 'دفاتر', stock: 70, isOffer: false, isSelected: false, images: [img('book2')], options: [] },
  { name: 'أقلام تلوين أنمي', description: 'مجموعة أقلام تلوين 12 لوناً.', price: 12000, category: 'قرطاسية', subcategory: 'أقلام', stock: 90, isOffer: false, isSelected: false, images: [img('crayons')], options: [] },
  { name: 'حقيبة ظهر جيمس', description: 'حقيبة بتصميم مميز.', price: 38000, category: 'حقائب', subcategory: 'ظهرية', stock: 15, isOffer: false, isSelected: false, images: [img('bag2')], options: [] },
  { name: 'سلسلة نيكو', description: 'سلسلة أنمي.', price: 8000, category: 'إكسسوارات', subcategory: 'سلاسل', stock: 33, isOffer: true, isSelected: false, images: [img('chain2')], options: [] },
  { name: 'خاتم أوكو', description: 'خاتم أنمي فضي.', price: 16000, category: 'إكسسوارات', subcategory: 'خواتم', stock: 28, isOffer: false, isSelected: false, images: [img('ring2')], options: [{ name: 'المقاس', values: ['19', '20'] }] },
  { name: 'بوستر أنمي A3', description: 'بوستر مطبوع عالي الجودة.', price: 8000, category: 'قرطاسية', subcategory: 'ملصقات', stock: 55, isOffer: false, isSelected: true, images: [img('poster')], options: [] },
];

async function main() {
  const url = config.migrationDatabaseUrl || config.databaseUrl;
  console.log('Seeding database…');
  await runMigrations(url);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const categoryIds: Record<string, string> = {};
    for (const c of CATEGORIES) {
      const { rows } = await client.query(
        `INSERT INTO categories (name, image_url)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [c.name, c.imageUrl],
      );
      categoryIds[c.name] = rows[0]!.id;
    }

    const subcategoryIds: Record<string, string> = {};
    for (const [categoryName, subs] of Object.entries(SUBCATEGORIES)) {
      for (const sub of subs) {
        const { rows } = await client.query(
          `INSERT INTO subcategories (category_id, name)
           VALUES ($1, $2)
           ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [categoryIds[categoryName], sub],
        );
        subcategoryIds[`${categoryName}/${sub}`] = rows[0]!.id;
      }
    }

    for (const p of PRODUCTS) {
      const categoryId = categoryIds[p.category];
      const subcategoryId = subcategoryIds[`${p.category}/${p.subcategory}`];
      const { rows } = await client.query(
        `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_offer, is_selected, rating, review_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 4.5, 0)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [p.name, p.description, p.price, categoryId, subcategoryId, p.stock, p.isOffer, p.isSelected],
      );
      if (rows.length === 0) continue;
      const productId = rows[0]!.id;
      for (const [i, imageUrl] of p.images.entries()) {
        await client.query(
          'INSERT INTO product_images (product_id, url, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [productId, imageUrl, i],
        );
      }
      for (const option of p.options) {
        await client.query(
          'INSERT INTO product_options (product_id, name, values) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [productId, option.name, option.values],
        );
      }
    }

    for (const g of GOVERNORATES) {
      await client.query(
        `INSERT INTO governorates (name, delivery_fee)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET delivery_fee = EXCLUDED.delivery_fee`,
        [g.name, g.deliveryFee],
      );
    }

    await client.query(
      `INSERT INTO banners (image_url, destination_type, sort_order)
       VALUES ($1, 'category', 1), ($2, 'category', 2)
       ON CONFLICT DO NOTHING`,
      [img('banner1'), img('banner2')],
    );

    const adminPhone = '07700000000';
    const passwordHash = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO users (username, phone, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (phone) DO UPDATE SET role = 'admin'`,
      ['مدير المتجر', adminPhone, passwordHash],
    );

    await client.query('COMMIT');
    console.log(`Seeded: ${CATEGORIES.length} categories, ${PRODUCTS.length} products, ${GOVERNORATES.length} governorates.`);
    console.log(`Admin user: ${adminPhone} / admin123`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePools();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
-- =============================================================================
-- Smart Canteen — DEMONSTRATION SEED DATA
--
-- Everything in this file is sample content for development and demos:
-- the menu, prices, stock levels, opening hours and the announcement.
-- It contains NO orders, payments or sales figures — popularity and reports
-- are always computed from real orders placed through the app.
--
-- Replace this content from the admin dashboard (/admin/menu, /admin/settings)
-- before going live. Photos are free-to-use images hosted on Unsplash
-- (https://unsplash.com/license).
-- =============================================================================

update public.canteen_settings
   set canteen_name     = 'Smart Canteen',
       location         = null,
       opening_time     = '07:30',
       closing_time     = '22:00',
       open_days        = '{1,2,3,4,5,6,7}',
       accepting_orders = true,
       announcement     = 'Demo menu: items, prices and photos are sample content for evaluation.',
       service_fee_paise = 0
 where id;

insert into public.categories (id, name, slug, description, image_url, sort_order) values
  ('10000000-0000-4000-8000-000000000001', 'Breakfast', 'breakfast', 'Fresh South Indian and North Indian mornings',
   'https://images.unsplash.com/photo-1589301760014-d929f3979dbc', 1),
  ('10000000-0000-4000-8000-000000000002', 'Meals', 'meals', 'Filling plates for lunch and dinner',
   'https://images.unsplash.com/photo-1742281257687-092746ad6021', 2),
  ('10000000-0000-4000-8000-000000000003', 'Snacks', 'snacks', 'Quick bites between lectures',
   'https://images.unsplash.com/photo-1601050690597-df0568f70950', 3),
  ('10000000-0000-4000-8000-000000000004', 'Beverages', 'beverages', 'Chai, coffee and fresh juices',
   'https://images.unsplash.com/photo-1619581073186-5b4ae1b0caad', 4),
  ('10000000-0000-4000-8000-000000000005', 'Desserts', 'desserts', 'Something sweet to finish',
   'https://images.unsplash.com/photo-1636743715220-d8f8dd900b87', 5)
on conflict (id) do nothing;

insert into public.menu_items
  (id, category_id, name, description, price_paise, image_url, is_vegetarian, dietary_notes, is_available, stock_quantity, is_featured, sort_order)
values
  -- Breakfast
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Masala Dosa',
   'Crisp rice-and-lentil crêpe filled with spiced potato, served with sambar and coconut chutney.',
   6000, 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976', true, null, true, null, true, 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Idli Sambar',
   'Three steamed rice cakes with hot sambar and coconut chutney.',
   4000, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc', true, null, true, null, false, 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Medu Vada',
   'Two crunchy lentil doughnuts with sambar and chutneys.',
   4000, 'https://images.unsplash.com/photo-1756757077703-26dc3ba7e853', true, null, true, null, false, 3),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Kanda Poha',
   'Flattened rice tempered with onion, peanuts, curry leaves and a squeeze of lime.',
   3000, 'https://images.unsplash.com/photo-1789991184412-c29c9dfa2b39', true, null, true, null, false, 4),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Aloo Paratha',
   'Two whole-wheat flatbreads stuffed with spiced potato, with curd and pickle.',
   5000, 'https://images.unsplash.com/photo-1708783741187-ff1d081d87da', true, 'Served with curd (contains dairy).', true, 25, false, 5),

  -- Meals
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'Veg Thali',
   'Rice, two rotis, dal, two seasonal sabzis, salad and a sweet.',
   9000, 'https://images.unsplash.com/photo-1742281257687-092746ad6021', true, null, true, null, true, 1),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'Veg Fried Rice',
   'Wok-tossed rice with crunchy vegetables and spring onion.',
   8000, 'https://images.unsplash.com/photo-1664717698774-84f62382613b', true, null, true, null, false, 2),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'Chole Bhature',
   'Spiced chickpea curry with two fluffy fried breads, onions and pickle.',
   7000, 'https://images.unsplash.com/photo-1788602564560-9bcbf0f9acb6', true, null, true, null, false, 3),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', 'Veg Biryani',
   'Fragrant basmati rice layered with vegetables and whole spices, with raita.',
   9000, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8', true, 'Served with raita (contains dairy).', true, null, false, 4),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'Dal Makhani & Rice',
   'Slow-cooked black lentils finished with butter, served with steamed rice.',
   8000, 'https://images.unsplash.com/photo-1788601988466-9f361c34c6cb', true, 'Contains dairy.', true, null, false, 5),

  -- Snacks
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000003', 'Samosa (2 pcs)',
   'Golden pastry filled with spiced potato and peas, with mint and tamarind chutney.',
   3000, 'https://images.unsplash.com/photo-1601050690597-df0568f70950', true, null, true, 40, true, 1),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000003', 'Veg Grilled Sandwich',
   'Toasted sandwich with vegetables, cheese and green chutney.',
   5500, 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af', true, 'Contains cheese.', true, null, false, 2),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000003', 'Vada Pav',
   'Mumbai-style spiced potato fritter in a soft bun with dry garlic chutney.',
   2500, 'https://images.unsplash.com/photo-1769030905851-c0e0a4fe5c51', true, null, true, null, true, 3),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000003', 'Pav Bhaji',
   'Buttery mashed vegetable curry with two toasted pavs, onion and lemon.',
   7000, 'https://images.unsplash.com/photo-1753357303396-704b5abe8945', true, 'Contains butter.', true, null, false, 4),
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000003', 'Paneer Tikka',
   'Char-grilled cottage cheese and peppers in a smoky tandoori marinade.',
   10000, 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8', true, 'Contains dairy.', false, null, false, 5),

  -- Beverages
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000004', 'Masala Chai',
   'Strong tea brewed with milk, ginger and cardamom.',
   1500, 'https://images.unsplash.com/photo-1619581073186-5b4ae1b0caad', true, 'Contains milk.', true, null, true, 1),
  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000004', 'Filter Coffee',
   'South Indian decoction coffee with frothy hot milk.',
   2000, 'https://images.unsplash.com/photo-1758387941825-a6ecaec9c14d', true, 'Contains milk.', true, null, false, 2),
  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000004', 'Cold Coffee',
   'Chilled blended coffee with milk and ice.',
   5000, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735', true, 'Contains milk.', true, null, true, 3),
  ('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000004', 'Fresh Lime Soda',
   'Fresh lime with soda — sweet, salted or mixed.',
   3000, 'https://images.unsplash.com/photo-1621263764928-df1444c5e859', true, null, true, null, false, 4),
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000004', 'Mango Lassi',
   'Thick yoghurt drink blended with ripe mango.',
   4500, 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4', true, 'Contains dairy.', true, null, false, 5),
  ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000004', 'Fresh Orange Juice',
   'Freshly squeezed orange juice, no added water.',
   5000, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba', true, null, true, null, false, 6),

  -- Desserts
  ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000005', 'Chocolate Brownie',
   'Dense, fudgy chocolate brownie square.',
   4500, 'https://images.unsplash.com/photo-1636743715220-d8f8dd900b87', null, 'Ask at the counter about egg content.', true, 12, false, 1),
  ('20000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000005', 'Gulab Jamun (2 pcs)',
   'Warm milk-solid dumplings soaked in cardamom sugar syrup.',
   3000, 'https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77', true, 'Contains dairy.', true, 30, false, 2),
  ('20000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000005', 'Seasonal Fruit Bowl',
   'Freshly cut seasonal fruit.',
   5000, 'https://images.unsplash.com/photo-1519996529931-28324d5a630e', true, null, true, null, false, 3),
  ('20000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000005', 'Ice Cream Cup',
   'Single-serve ice cream cup — ask for today''s flavour.',
   3500, 'https://images.unsplash.com/photo-1534706936160-d5ee67737249', null, 'Contains dairy.', true, null, false, 4)
on conflict (id) do nothing;

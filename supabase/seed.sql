-- kaupet_open: eksempelkategorier for lokal utvikling og isolerte CI/E2E-
-- databaser. Kjøres av `supabase start`/`supabase db reset` etter
-- migrasjonene. Bygg ditt eget kategoritre i admin eller i en egen migrasjon.

-- Forsiden viser bare hovedkategorier med farge.
INSERT INTO public.categories (slug, name_nb, sort_order, icon, color, is_hidden)
VALUES
  ('elektronikk', 'Elektronikk', 10, 'Laptop', 'oklch(0.55 0.12 250)', false),
  ('mobler-og-interior', 'Møbler og interiør', 20, 'Sofa', 'oklch(0.55 0.10 60)', false),
  ('sport-og-friluft', 'Sport og friluft', 30, 'Mountain', 'oklch(0.50 0.10 150)', false),
  ('klaer-og-tilbehor', 'Klær og tilbehør', 40, 'Shirt', 'oklch(0.58 0.13 15)', false),
  -- Brukes av E2E-testene (se e2e/global-setup.ts og publish-listing*.spec.ts).
  ('e2e-test-listing', 'E2E-test (ikke bruk)', 9999, 'FlaskConical', NULL, true),
  ('e2e-test-listing-guest', 'E2E-test gjest (ikke bruk)', 9999, 'FlaskConical', NULL, false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.categories (slug, name_nb, sort_order, parent_id, icon, is_hidden)
SELECT child.slug, child.name_nb, child.sort_order, parent.id, child.icon, false
FROM (
  VALUES
    ('mobiltelefoner', 'Mobiltelefoner', 10, 'elektronikk', 'Smartphone'),
    ('tv-og-lyd', 'TV og lyd', 20, 'elektronikk', 'Tv'),
    ('sofaer', 'Sofaer', 10, 'mobler-og-interior', 'Sofa'),
    ('sykler', 'Sykler', 10, 'sport-og-friluft', 'Bike'),
    ('telt-og-camping', 'Telt og camping', 20, 'sport-og-friluft', 'Tent')
) AS child(slug, name_nb, sort_order, parent_slug, icon)
JOIN public.categories AS parent ON parent.slug = child.parent_slug
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order, is_optional)
SELECT category.id, filter.key, filter.label_nb, filter.type, filter.unit, filter.options::jsonb, filter.sort_order, filter.is_optional
FROM (
  VALUES
    ('mobiltelefoner', 'storage_gb', 'Lagring', 'select', 'GB',
      '[{"value":"64","label_nb":"64 GB"},{"value":"128","label_nb":"128 GB"},{"value":"256","label_nb":"256 GB"},{"value":"512","label_nb":"512 GB eller mer"}]', 10, true),
    ('sofaer', 'seats', 'Antall seter', 'number', 'seter', NULL, 10, true),
    ('sykler', 'bike_type', 'Type', 'select', NULL,
      '[{"value":"city","label_nb":"Bysykkel"},{"value":"road","label_nb":"Landeveissykkel"},{"value":"mountain","label_nb":"Terrengsykkel"},{"value":"electric","label_nb":"Elsykkel"}]', 10, false),
    ('sykler', 'frame_size', 'Rammestørrelse', 'select', NULL,
      '[{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"}]', 20, true),
    ('klaer-og-tilbehor', 'size', 'Størrelse', 'select', NULL,
      '[{"value":"xs","label_nb":"XS"},{"value":"s","label_nb":"S"},{"value":"m","label_nb":"M"},{"value":"l","label_nb":"L"},{"value":"xl","label_nb":"XL"}]', 10, true)
) AS filter(category_slug, key, label_nb, type, unit, options, sort_order, is_optional)
JOIN public.categories AS category ON category.slug = filter.category_slug
ON CONFLICT (category_id, key) DO NOTHING;

-- Migration: Products & Product Categories Schema Alignment & Data Repair
-- Description: Adds product_code, created_by, updated_by to public.products & public.product_categories, repairs BIOLAC category FK, and reloads schema cache.

-- 1. Add missing audit & code columns to public.products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Add missing audit columns to public.product_categories
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Insert default "General" category (repair BIOLAC category reference)
INSERT INTO public.product_categories (id, name, created_at, updated_at)
VALUES ('b3392a71-d7bd-479a-ba0b-097de0087b8a', 'General', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 4. Repair any product category_id references pointing to nonexistent categories
UPDATE public.products
SET category_id = 'b3392a71-d7bd-479a-ba0b-097de0087b8a'
WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM public.product_categories);

-- 5. Add foreign key constraint fk_products_category if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_category'
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES public.product_categories(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

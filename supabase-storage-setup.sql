-- ============================================================
-- CONFIGURACIÓN DE STORAGE - CHESS KING
-- Ejecuta este script en el SQL Editor de Supabase
-- Ve a: https://supabase.com/dashboard/project/khrxddafhzvfdyivysay/sql/new
-- ============================================================

-- 1. Crear el bucket 'banners' si no existe y hacerlo público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners', 
  'banners', 
  true, 
  2097152, -- Límite de 2MB (2 * 1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE 
SET public = true, 
    file_size_limit = 2097152, 
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- 2. Asegurarse de que Row Level Security (RLS) esté habilitado en storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar políticas de storage existentes para evitar duplicados o conflictos
DROP POLICY IF EXISTS "Permitir lectura pública de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida pública de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualización de banners" ON storage.objects;
DROP POLICY IF EXISTS "Permitir borrado de banners" ON storage.objects;

-- 4. Crear políticas de acceso público para el bucket 'banners'

-- Permitir que CUALQUIERA (público/anon) pueda ver las imágenes (SELECT)
CREATE POLICY "Permitir lectura pública de banners"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'banners');

-- Solo el ADMIN autenticado puede subir imágenes (INSERT)
CREATE POLICY "Permitir subida solo admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'banners' AND public.is_admin());

-- Solo el ADMIN autenticado puede actualizar imágenes (UPDATE)
CREATE POLICY "Permitir actualización solo admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'banners' AND public.is_admin())
WITH CHECK (bucket_id = 'banners' AND public.is_admin());

-- Solo el ADMIN autenticado puede borrar imágenes (DELETE)
CREATE POLICY "Permitir borrado solo admin"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'banners' AND public.is_admin());

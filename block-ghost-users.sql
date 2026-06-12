CREATE OR REPLACE FUNCTION block_ghost_user()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IN (
    'fernandito703k@gmail.com',
    'testuser@test.com',
    'test@test.com',
    'test_rls@test.com',
    'test1@chessking.com',
    'testuser001@chessking.com'
  ) THEN
    RAISE EXCEPTION 'Ghost user blocked: %', NEW.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ghost_user_block ON users;
CREATE TRIGGER ghost_user_block
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION block_ghost_user();

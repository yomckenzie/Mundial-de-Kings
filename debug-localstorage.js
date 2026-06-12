// Pegar en la consola de DevTools (ya está ejecutado el bloque anterior,
// por eso necesitamos nombres nuevos)
const raw2 = localStorage.getItem('chessking_db');
console.log('---');
console.log('raw existe:', raw2 !== null);
console.log('raw length:', raw2 ? raw2.length : 0);
if (raw2) {
  const obj = JSON.parse(raw2);
  console.log('keys:', Object.keys(obj));
  console.log('prizes:', obj.prizes ? obj.prizes.length : 'NO EXISTE');
  console.log('users:', obj.users ? obj.users.length : 'NO EXISTE');
  console.log('currentUserEmail:', obj.currentUserEmail);
  if (obj.prizes && obj.prizes.length > 0) {
    console.log('primer premio:', JSON.stringify(obj.prizes[0]).slice(0, 200));
  }
}

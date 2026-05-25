export const appParams = {
  appId: 'chessking-local',
  token: localStorage.getItem('chessking_token') || null,
  fromUrl: window.location.href,
  functionsVersion: '1',
  appBaseUrl: window.location.origin,
};
WebSocket-Chat
==============

WebSocketを使ったチャットのサンプル  
  
#### 【特徴】
* 参加者全員共有のチャット  
* 二者間でのプライベートチャット  
* お絵かき機能（全共有のみ）  
* Desktop Notificationsを使った新着通知（GoogleChromeのみ）  

####【環境】
* Node.js v0.8.14  
* Socket.IO v0.9.11  
* Express v3.0.1  
* ExtJS v3.4.0  
  
####【ブラウザ】
* GoogleChrome 23（推奨）  
* Firefox16  
* IE9  
  
####【実行方法】
 * 事前準備として、src/extjs配下にext-3.4.0.zipを展開（src/extjs/ext-all.jsとなるように）
 * 今ソースから >node src\server.js で起動（第一引数でポート番号を指定可能）
 * ブラウザから http://localhost:3000/ws_chat.html でアクセス
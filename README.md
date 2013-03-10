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
* jayschema v0.1.5  
* ExtJS v3.4.0  
  
####【ブラウザ】
* GoogleChrome 23以降（推奨）  
* Firefox16以降  
* IE9以降  
  
####【実行方法】
 * Node.jsをインストールし、上記環境で書いた必須モジュールを追加
 * src/extjs配下にext-3.4.0.zipを展開（src/extjs/ext-all.jsとなるように）
 * コンソールから >node src\server.js で起動（第一引数でポート番号を指定可能）
 * ブラウザから http://localhost:3000/ws_chat.html でアクセス

var APP_CONFIG = {

	/** アプリケーションが利用するポート番号。サーバ起動時に引数で指定するとそちらが優先される */
	PORT : 80

	/** 自前で通信データを暗号化するかどうか。ポート番号443(SSL)を使用している場合には不要なのでfalseにすること */
	, ENCRYPTION : true

	/** メッセージキューのサイズ（保存するログのサイズ） */
	, MSG_QUEUE_SIZE : 75
	/** お絵かきキューのサイズ（保存するログのサイズ） */
	, FIGURE_QUEUE_SIZE : 35

	/** 添付画像の最大横幅(ピクセル) */
	, IMAGE_MAX_WIDTH : 1280
	/** 添付画像の最大縦幅(ピクセル) */
	, IMAGE_MAX_HEIGHT : 1024

	/** BASIC認証を行うかどうか */
	, BASIC_AUTH : false
	/** BASIC認証を行う際のユーザID/パスワード設定ファイル */
	, BASIC_AUTH_FILE: '../basicAuth.json'

};

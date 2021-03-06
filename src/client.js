
(function(global) {

Ext.BLANK_IMAGE_URL = "extjs/resources/images/default/s.gif";

var socket = null;
var connected = false;
var config = {};
var configTmp = null;

var wsChatDB = null;
var readDatabase = function(storeName) {
	var func =  function(resolve, reject) {
		if (wsChatDB == null) {
			setTimeout(function(){ func(resolve, reject) }, 300);
			return;
		}
		var tx = wsChatDB.transaction(storeName, 'readwrite');
		// console.log(tx);
		var store = tx.objectStore(storeName);
		console.log(store);
		var request = store.openCursor();
		console.log(request);
		var dataList = [];
		request.onsuccess = function() {
			var cursor = request.result;
			if (cursor) {
				// console.log(cursor.value);
				dataList.push(cursor.value);
				cursor.continue();
			} else {
				resolve(dataList);
			}
		};
		request.onerror = function() {
			console.log('request error');
			console.log(arguments);
			reject(request.error);
		};
	};
	return func;
};

var myID, myName, myHost, myAddr;
var userStore = new Ext.data.JsonStore({
	'autoDestroy': true,
	'storeId': 'userStore',
	'sortInfo': {
		'field': 'loginDate',
		'direction': 'DESC'
	},
	'root': 'users',
	'idProperty': 'id',
	'fields': ['id', 'name', 'state', 'host', 'addr', 'loginDate', 'userAgent']
});
var commonKey;

if (!global.console) {
	global.console = {
		'log' : function() {}
	};
}
if (!global.JSON) {
	global.JSON = {
		'stringify' : function(o) { return Ext.util.JSON.encode(o); },
		'parse' : function(s) { return Ext.util.JSON.decode(s); }
	};
}
if (!global.localStorage) {
	global.localStorage = {};
}

if (global.applicationCache) {
	var appCache = global.applicationCache;
	// appCache.addEventListener('cached', function(){ console.log('cached: '+JSON.stringify(arguments)); });
	// appCache.addEventListener('checking', function(){ console.log('checking: '+JSON.stringify(arguments)); });
	// appCache.addEventListener('downloading', function(){ console.log('downloading: '+JSON.stringify(arguments)); });
	// appCache.addEventListener('noupdate', function(){ console.log('noupdate: '+JSON.stringify(arguments)); });
	// appCache.addEventListener('obsolete', function(){ console.log('obsolete: '+JSON.stringify(arguments)); });
	// appCache.addEventListener('progress', function(){ console.log('progress: '+JSON.stringify(arguments)); });
	appCache.addEventListener('updateready', function(){
		// console.log('updateready: '+JSON.stringify(arguments));
		alert('アプリケーションが更新されました。リロードします。');
		appCache.swapCache();
		global.location.reload();
	});
}

Ext.EventManager.on(global, 'unload', function() {
	localStorage.config = JSON.stringify(config);
	if (wsChatDB != null) {
		wsChatDB.close();
	}
	if (socket != null) {
		socket.disconnect();
		socket = null;
	}
});

var NotificationUtil = {
	/**
	 * @see http://www.w3.org/TR/notifications/
	 * @see http://dev.chromium.org/developers/design-documents/desktop-notifications/api-specification
	 */
	isSupported : (global.Notification != null || global.webkitNotifications != null),
	checkPermission : function() {
		if (!this.isSupported) { return 'denied'; }
		if (global.Notification.permission) {
			return global.Notification.permission;
		}
		switch(global.webkitNotifications.checkPermission()) {
			case 0: //PERMISSION_ALLOWED
				return 'granted';
			case 1: //PERMISSION_NOT_ALLOWED
				return 'default';
			case 2: //PERMISSION_DENIED
				return 'denied';
		}
		return 'denied';
	},
	requestPermission : function(callback) {
		if (!this.isSupported) { return; }
		if (global.Notification) {
			global.Notification.requestPermission(callback);
		} else if (global.webkitNotifications) {
			global.webkitNotifications.requestPermission(callback);
		}
	},
	createNotification : function(title, option, eventHandler) {
		if (!this.isSupported) { return; }
		var notification;
		if (global.Notification) {
			notification = new global.Notification(title, {
				titleDir : option.titleDir,
				body : option.body,
				bodyDir : option.bodyDir,
				tag : option.tag || new Date().getTime(), //tagが同じメッセージは追加でなく置き換えになる
				iconUrl : option.iconUrl,
				icon : option.iconUrl //for GoogleChrome
  			});
			if (eventHandler.onclick) {
				notification.onclick = function() { eventHandler.onclick.apply(notification, arguments); }
			}
			if (eventHandler.onshow) {
				notification.onshow = function() { eventHandler.onshow.apply(notification, arguments); }
			}
			if (eventHandler.onerror) {
				notification.onerror = function() { eventHandler.onerror.apply(notification, arguments); }
			}
			if (eventHandler.onclose) {
				notification.onclose = function() { eventHandler.onclose.apply(notification, arguments); }
			}
		} else if (global.webkitNotifications) {
			notification = global.webkitNotifications.createNotification(
				option.iconUrl,
				title,
				option.body
			);
			if (!notification.close) {
				notification.close = function() { notification.cancel(); }
			}
			if (eventHandler.onclick) {
				notification.onclick = function() { eventHandler.onclick.apply(notification, arguments); }
			}
			if (eventHandler.onshow) {
				notification.ondisplay = function() { eventHandler.onshow.apply(notification, arguments); }
			}
			if (eventHandler.onerror) {
				notification.onerror = function() { eventHandler.onerror.apply(notification, arguments); }
			}
			if (eventHandler.onclose) {
				notification.onclose = function() { eventHandler.onclose.apply(notification, arguments); }
			}
			notification.show();
		};
		// console.log('createNotification: ' + notification);
		return notification;
	}

};


var MessageView = Ext.extend(Ext.Panel, {
	constructor: function(config) {
		MessageView.superclass.constructor.call(this, config);
	}
});

var MessagePanel = Ext.extend(Ext.Panel, {

	sendMessage : function(data, noEncryptData) {
		sendMessage(data, noEncryptData);
	},

	onClose : function(panel) {},

	constructor: function(user) {

		var messagePanel = this;

		var isPrivate = (user != null);
		var escapedUserID = isPrivate ? Ext.util.Format.htmlEncode(user.id) : '';
		var escapedUserName = isPrivate ? Ext.util.Format.htmlEncode(user.name) : '';
		var escapedHost = isPrivate ? Ext.util.Format.htmlEncode(user.host) : '';
		var escapedAddr = isPrivate ? Ext.util.Format.htmlEncode(user.addr) : '';

		var tabName = isPrivate ? ('PrivateTab_' + escapedUserID) : 'MainTab';
		var viewName = isPrivate ? ('PrivateView_' + escapedUserID) : 'MainView';
		var containerName = isPrivate ? ('PrivateMsgContainer_' + escapedUserID) : 'MainMsgContainer';
		var msgName = isPrivate ? ('PrivateMsg_' + escapedUserID) : 'MainMsg';
		var dummyImageName = isPrivate ? ('dummyImage_' + escapedUserID) : 'dummyImage';
		var mainImageName = isPrivate ? ('MainImage_' + escapedUserID) : 'MainImage';
		var imageIconName = isPrivate ? ('MainImgIcon_' + escapedUserID) : 'MainImgIcon';
		var sendButtonName = isPrivate ? ('PrivateMsgSendButton_' + escapedUserID) : 'MsgSendButton';
		var msgEffectPanelName = isPrivate ? ('msgEffectPanel_' + escapedUserID) : 'msgEffectPanel';
		var notifyCheckName = isPrivate ? ('PrivateNotify_' + escapedUserID) : null;

		var buttonWidth = Math.ceil(Ext.util.TextMetrics.measure(document.body, 'あ').width * 4);

		var panelConfig = {
			id : tabName,
			title	: isPrivate ? ('w/ ' + escapedUserName) : '共有タイムライン',
			closable : isPrivate ? true : false,
			layout : 'fit',
			listeners : {
				close : function(panel) {
					messagePanel.onClose(panel);
				}
			},
			items : [{
				title : isPrivate ? (escapedUserName + ' : ' + escapedHost + '(' + escapedAddr + ')' + ' とのプライベート板') : null,
				layout : 'border',
				items : [{
					id : containerName,
					region:'north',
					split: true,
					border : false,
					autoHeight : false,
					layout : 'hbox',
					listeners : {
						resize : function(panel, adjWidth, adjHeight, rawWidth, rawHeight) {
							var textArea = Ext.getCmp(msgName);
							var childWidth = 0;
							panel.items.each(function(child) {
								child.setHeight(panel.getHeight());
								if (child != textArea) { childWidth += child.getWidth(); }
							});
							setTimeout(function() {
								textArea.setWidth(adjWidth - childWidth);
								Ext.getCmp(containerName).doLayout();
							}, 10);
						}
					},
					items : [
	 					new Ext.form.TextArea({
	 						id : msgName,
	 						width : 50,
	 						enableKeyEvents : true,
	 						// preventScrollbars : true,
	 						style : {
								fontSize : '1.2em'
	 						},
	 						listeners : {
	 							render : function(textField) {

	 								Ext.getCmp(containerName).setHeight(
	 									Math.ceil(Ext.util.TextMetrics.measure(msgName, 'あ').height * 2.5) + 2);

	 								var dom = textField.getEl().dom;
									var reader = new FileReader();
									var img = document.getElementById(dummyImageName);

									img.onload = function() {
										try {
											// img.onload = Ext.emptyFn;
											var imageWidth = img.width;
											var imageHeight = img.height;
											// console.log(imageWidth + ' : ' + imageHeight);
											if (imageWidth == 1 && imageHeight == 1) { return; }
											var scale = (function() {
												var IMAGE_MAX_WIDTH = APP_CONFIG.IMAGE_MAX_WIDTH;
												var IMAGE_MAX_HEIGHT = APP_CONFIG.IMAGE_MAX_HEIGHT;
												if (imageWidth <= IMAGE_MAX_WIDTH && imageHeight <= IMAGE_MAX_HEIGHT) { return 1; }
												return Math.min(IMAGE_MAX_WIDTH/imageWidth, IMAGE_MAX_HEIGHT/imageHeight);
											})();
											// console.log('scale = ' + scale);
											var canvas = document.getElementById(mainImageName);
											canvas.width = Math.ceil(img.width * scale);
											canvas.height = Math.ceil(img.height * scale);
											var ctx = canvas.getContext('2d');
											// console.log(ctx);
											ctx.save();
											ctx.scale(scale, scale);
											ctx.drawImage(img, 0, 0);
											ctx.restore();
											Ext.getCmp(imageIconName).enable();
											img.src = Ext.BLANK_IMAGE_URL;
										} catch(e) {
											console.log(e);
										}
									};

									reader.onerror = function(err) { console.log(err); };
									reader.onload = function(event) {
										// console.log(event);
										img.src = event.target.result;
									};

									Ext.EventManager.on(dom, 'paste', function(event) {
										try {
		 									// console.log(event.clipboardData);
		 									// console.log(event.clipboardData.items);
											var dataItem = event.browserEvent.clipboardData.items[0];
											// console.log(dataItem);
											var file = dataItem.getAsFile();
											// console.log(file);
											var dataType = dataItem.type;
											// console.log(dataType);
											if (/^image\//.test(dataType)) {
												reader.readAsDataURL(file);
											}
										} catch(e) {
											console.log(e);
										}
	 								});

									Ext.EventManager.on(dom, 'dragenter', function(event) {
										textField.getEl().highlight();
									});
									Ext.EventManager.on(dom, 'drop', function(event) {
										try {
											var file = event.browserEvent.dataTransfer.files[0];
											// console.log(file);
											var dataType = file.type;
											// console.log(dataType);
											if (/^image\//.test(dataType)) {
												reader.readAsDataURL(file);
											}
										} catch(e) {
											console.log(e);
										}
									});
	 							},
	 							keydown : function(textField, event) {
	 								if (event.getKey() == 13 && 
	 									((config.enable_ShortcutKeyCtrlEnter && event.ctrlKey) || 
	 									 (config.enable_ShortcutKeyShiftEnter && event.shiftKey) ||
	 									 (config.enable_ShortcutKeyAltEnter && event.altKey))
	 								) {
	 									var b = Ext.getCmp(sendButtonName);
	 									b.fireEvent('click', b, event);
	 									event.stopEvent();
	 									return false;
	 								}
	 							}
	 						}
						}),
						{
							border : false,
							width : buttonWidth,
							margins : 0,
							padding : 0,
							layout: 'fit',
							items : [{
								xtype : 'button',
								id : imageIconName,
								autoWidth : false,
								autoHeight : false,
								disabled : true,
								text : '画像なし',
								listeners: {
									afterrender : function(self) {
										self.setWidth(buttonWidth);
		 								self.setHeight(Ext.getCmp(msgName).getHeight());
									},
									enable : function(self) {
										self.setText('画像あり');
									},
									disable : function(self) {
										self.setText('画像なし');
									},
									click : (function() {
										var win = new Ext.Window({
											//autoWidth : true,
											width : 500,
											//autoHeight : true,
											height : 350,
											buttonAlign : 'center',
											closable : true,
											closeAction : 'hide',
											initHidden : true,
											layout : 'fit',
											hideMode : 'visibility',
											modal : true,
											resizable : true,
											title : '添付画像',
											items : [
											{
												autoScroll : true,
												border : false,
												html : '<img id="'+dummyImageName+'" style="position:absolute;visibility:hidden;" />' +
													'<canvas id="'+mainImageName+'" style="border:1px solid silver;" />'
											}
											],
											listeners : {
												beforeshow : function(win) {
													var canvas = document.getElementById(mainImageName);
													var winWidth = Math.min(canvas.width+win.getFrameWidth()+Ext.getScrollBarWidth(), Math.floor(Ext.getBody().getWidth()*0.9));
													winWidth = Math.max(winWidth, 250);
													var winHeight = Math.min(canvas.height+win.getFrameHeight()+Ext.getScrollBarWidth(), Math.floor(Ext.getBody().getHeight()*0.8));
													winHeight = Math.max(winHeight, 100);
													// console.log(winWidth + ' : ' + winHeight);
													win.setSize(winWidth, winHeight);
													win.center();
												},
												render : function(win) {
													win.body.on('click', function() {
														win.hide();
													});
												}
											},
											fbar : [
											{
												text : '削除する',
												listeners : {
													click : function() {
														Ext.getCmp(imageIconName).disable();
														win.hide();
													}
												}
											},
											{
												text : '閉じる',
												listeners : {
													click : function() {
														win.hide();
													}
												}
											}
											]
										});
										win.show();
										win.hide();
										return function(self) {
											win.show();
										};
									})()
								}
							}]
						},
						new Ext.SplitButton((function() {
							var _sendMessage = function(effect) {
								var text = Ext.getCmp(msgName);
								var msg = text.getValue();
								if (msg != null && msg.length > 0) {
									messagePanel.sendMessage({
											msgTarget : isPrivate ? user.id : null,
											isReply : false,
											effect : effect,
											useReadNotification : ((notifyCheckName != null) ? Ext.getCmp(notifyCheckName).checked : null),
											msg : msg
										}, 
										(Ext.getCmp(imageIconName).disabled ? null : (function() {
											var canvas = document.getElementById(mainImageName);
											var imageWidth = canvas.width;
											var imageHeight = canvas.height;
											var imageData = canvas.toDataURL('image/png');
											console.log('imageData width='+imageWidth+' height='+imageHeight+' length='+imageData.length);
											return {
												imageWidth : imageWidth,
												imageHeight : imageHeight,
												imageData : imageData
											};
										})())
									);
									Ext.getCmp(imageIconName).disable();
									setTimeout(function(){ text.reset(); }, 0);
								}
								text.focus();
							};
							var clickHandler = function() {
								var form = Ext.getCmp(msgEffectPanelName).getForm();
								var i = 0;
								var checkBox;
								var effect = 0;
								while ((checkBox = form.findField('msgEffect_'+i)) != null) {
									// console.log('checkbox'+i+' : '+ checkBox.getValue());
									if (checkBox.getValue() == true) {
										effect = (effect | (1 << i));
									}
									i++;
								}
								// console.log(effect);
								_sendMessage(effect);
								win.hide();
							};
							var win = new Ext.Window({
								//autoWidth : true,
								width : 400,
								//autoHeight : true,
								height : 250,
								autoScroll : true,
								buttonAlign : 'center',
								closable : false,
								closeAction : 'hide',
								initHidden : true,
								layout : 'fit',
								hideMode : 'visibility',
								modal : true,
								resizable : true,
								title : 'エフェクト選択',
								items : [new Ext.form.FormPanel({
									id : msgEffectPanelName,
									bodyStyle: {
										padding : '5px',
									},
									defaultType: 'checkbox',
									keys : [{
										key: [49,50,51,52,53,54,55,56,57],
										fn: function(key, event){
											var form = Ext.getCmp(msgEffectPanelName).getForm();
											var checkBox = form.findField('msgEffect_'+(key - 49));
											if (checkBox != null && !checkBox.disabled) {
												checkBox.setValue(!checkBox.getValue());
											}
										}
									},{
										key: [13],
										fn: clickHandler
									}],
									labelWidth : 300,
									items : [{
										name: 'msgEffect_0',
										fieldLabel: '[1]文字を小さく(ShiftKeyと同じ)'
									}, {
										name: 'msgEffect_1',
										fieldLabel: '[2]文字を大きく(AltKeyと同じ)'
									}, {
										name: 'msgEffect_2',
										fieldLabel: '[3]投降後、数秒で自動的に削除',
										disabled: isPrivate
									}, {
										name: 'msgEffect_3',
										fieldLabel: '[4]強制的にデスクトップ通知を表示'
									}]
								})],
								listeners : {
									beforeshow : function(win) {
										var form = Ext.getCmp(msgEffectPanelName).getForm();
										var i = 0;
										var checkBox;
										while ((checkBox = form.findField('msgEffect_'+i)) != null) {
											checkBox.setValue(false);
											i++;
										}
									},
									show : function(win) {
										setTimeout(function() {
											var form = Ext.getCmp(msgEffectPanelName).getForm();
											form.findField('msgEffect_0').focus();
										}, 200);
									}
								},
								fbar : [
								{
									text : '送信',
									listeners : {
										click : clickHandler
									},
								},
								{
									text : 'キャンセル',
									listeners : {
										click : function() {
											win.hide();
										}
									}
								}
								]
							});
							return {
								id : sendButtonName,
								width : buttonWidth,
								text : '送信',
								menu: new Ext.menu.Menu({
									items: (function() {
										var returnVal = [{
											text: '各種効果',
											handler: function(){
												win.show();
											}
										}];
										if (isPrivate) {
											returnVal.push(new Ext.menu.CheckItem({
												id : notifyCheckName,
												text: '開封通知',
												checked : true
											}));
										}
										return returnVal;
									})()
								}),
								listeners : {
									afterrender : function(self) {
										self.setWidth(buttonWidth);
		 								self.setHeight(Ext.getCmp(msgName).getHeight());
									},
									click : function(button, event) {
										_sendMessage(event.shiftKey ? (1<<0) : event.altKey ? (1<<1) : 0);
									}
								}
							};
						})())
					]
				}, new MessageView({
					id : viewName,
					region:'center',
					autoScroll : true,
					bodyStyle : {
						backgroundColor : 'transparent !important'
						//backgroundColor : '#4E79B2 !important'
					},
					//layout : 'vbox',
					items : [
					]
				})]
			}]
		};
		console.log(panelConfig);

		MessagePanel.superclass.constructor.call(this, panelConfig);
	}
});

// ダイレクト通信で使用
var DirectMessagePanel = Ext.extend(MessagePanel, {
	myUser : null,
	targetUser : null,
	peerConnection : null,
	dataChannel : null,
	connected : true,

	sendMessage : function(data, noEncryptedData) {
		if (!this.connected) {
			Ext.MessageBox.alert('エラー', 'ダイレクト通信の接続が切れています。');
			return;
		}
		var sendMsg = {
			"data": {
				'msgTarget' : data.msgTarget,
				'isPrivate' : (data.msgTarget != null && '' != data.msgTarget),
				'useReadNotification' : false, //TODO 対応
				// 'useReadNotification' : (data.useReadNotification != null ? data.useReadNotification : false),
				'time' : new Date().getTime(),
				'id' : this.myUser.id,
				'name' : this.myUser.name,
				'host' : this.myUser.host,
				'addr' : this.myUser.addr,
				'effect' : data.effect,
				'color' : data.color,
				'msg' : data.msg,
				'imageData' : false, //TODO
				// 'imageData' : (noEncryptedData != null && noEncryptedData.imageData != null),
				'favorite' : null
			},
			"noEncryptedData" : null //TODO データサイズが大きいと一度に送れない
			// "noEncryptedData" : noEncryptedData
		};
		// console.log(sendMsg);

		this.dataChannel.send(JSON.stringify(sendMsg));
		this.onMessage(sendMsg);
	},

	onMessage : function(msg) {
		handleMessage(this.myUser.id, msg.data, msg.noEncryptedData);
	},

	onClose : function(panel) {
		this.connected = false;
		if (this.dataChannel != null) {
			this.dataChannel.close();
			this.dataChannel = null;
		}
		if (this.peerConnection != null) {
			this.peerConnection.close();
			this.peerConnection = null;
		}
	},

	constructor: function(targetUser, myUser, peerConnection, dataChannel) {
		var self = this;
		self.targetUser = targetUser;
		self.myUser = myUser;
		self.peerConnection = peerConnection;
		self.dataChannel = dataChannel;

		dataChannel.onerror = function (error) {
			console.log("onerror:"+ error);
			console.log(error);
		};

		dataChannel.onclose = function (event) {
			console.log("onclose");
			if (self.connected) {
				showDesktopPopup(
					'通知 ('+Ext.util.Format.date(new Date(),'Y/m/d H:i:s')+')',
					self.targetUser.name + ' とのダイレクト通信の接続が切れました。',
					-1);
			}
			self.connected = false;
		};

		dataChannel.onmessage = function (event) {
			var msg = JSON.parse(event.data);
			// console.log(msg);
			self.onMessage(msg);
		};

		DirectMessagePanel.superclass.constructor.call(this, targetUser);
	}
});

Ext.onReady(function() {

	//ファイルのドラッグ誤操作を防止
	Ext.EventManager.on(document.body, 'dragenter', function(e) { e.stopEvent(); })
	Ext.EventManager.on(document.body, 'dragover', function(e) { e.stopEvent(); })
	Ext.EventManager.on(document.body, 'drop', function(e) { e.stopEvent(); })

	Ext.QuickTips.init();
	Ext.apply(Ext.QuickTips.getQuickTip(), {
		maxWidth: 200,
		minWidth: 100,
		showDelay: 50,
		trackMouse: true
	});

	//設定読み込み
	if (localStorage.config != null && localStorage.config != '' && localStorage.config != 'null') {
		config = JSON.parse(localStorage.config);
	}
	config = Ext.applyIf(config, {
		'notification_publicMsg' : true,
		'notification_publicMsgTime' : 3.5,
		'notification_publicReplyMsg' : true,
		'notification_publicReplyMsgTime' : 3.5,
		'notification_privateMsg' : true,
		'notification_privateMsgTime' : -1,
		'notification_privateReplyMsg' : true,
		'notification_privateReplyMsgTime' : -1,
		'notification_userAddDel' : true,
		'notification_userAddDelTime' : 3.5,
		'notification_sound' : false,
		'enable_ShortcutKeyCtrlEnter' : true,
		'enable_ShortcutKeyShiftEnter' : true,
		'enable_ShortcutKeyAltEnter' : true,
		'messagePanel_fontSize' : 100
	});
	console.log('config : ' + JSON.stringify(config));

	//通知用音声ファイルのロード
	var audioElement = document.createElement('audio');
	audioElement.id = 'notificationAudio';
	audioElement.src = APP_CONFIG.NOTIFICATION_SOUND_FILE;
	audioElement.preload = 'auto';
	audioElement.style.visibility = 'hidden';
	document.body.appendChild(audioElement);
	
	var configDialog = new Ext.Window({
		id : 'configDialog',
		//autoWidth : true,
		width : 500,
		//autoHeight : true,
		height : 450,
		buttonAlign : 'center',
		closable : true,
		closeAction : 'hide',
		initHidden : true,
		modal : true,
		resizable : true,
		title : '設定',
		layout : 'border',
		listeners : {
			show : function(dialog) {
				Ext.getCmp('configTab').setActiveTab(0);

				configTmp = Ext.apply({}, config);

				Ext.getCmp('notification_publicMsg_Field').setValue(config.notification_publicMsg);
				Ext.getCmp('notification_publicMsgTime_Field').setDisabled(!config.notification_publicMsg);
				Ext.getCmp('notification_publicMsgTime_Field').setValue(config.notification_publicMsgTime);

				Ext.getCmp('notification_privateMsg_Field').setValue(config.notification_privateMsg);
				Ext.getCmp('notification_privateMsgTime_Field').setDisabled(!config.notification_privateMsg);
				Ext.getCmp('notification_privateMsgTime_Field').setValue(config.notification_privateMsgTime);

				Ext.getCmp('notification_userAddDel_Field').setValue(config.notification_userAddDel);
				Ext.getCmp('notification_userAddDelTime_Field').setDisabled(!config.notification_userAddDel);
				Ext.getCmp('notification_userAddDelTime_Field').setValue(config.notification_userAddDelTime);

				Ext.getCmp('notification_sound_Field').setValue(config.notification_sound);

				Ext.getCmp('enable_ShortcutKeyCtrlEnter_Field').setValue(config.enable_ShortcutKeyCtrlEnter);
				Ext.getCmp('enable_ShortcutKeyShiftEnter_Field').setValue(config.enable_ShortcutKeyShiftEnter);
				Ext.getCmp('enable_ShortcutKeyAltEnter_Field').setValue(config.enable_ShortcutKeyAltEnter);
			}
		},
		fbar : [{
			text : '　OK　',
			listeners : {
				click : function() {
					config = configTmp;
					localStorage.config = JSON.stringify(config);
					Ext.getCmp('configDialog').hide();
				}
			}
		}, {
			text : 'キャンセル',
			listeners : {
				click : function() {
					Ext.getCmp('configDialog').hide();
				}
			}
		}],
		items : [
			new Ext.TabPanel({
				id : 'configTab',
				activeTab: 0,
				enableTabScroll : true,
				region : 'center',
				defaults : {
					autoScroll : true,
					padding : 5
				},
				items: [{
					title: 'デスクトップ通知',
					layout : 'border',
					autoScroll : true,
					items : [{
						border : false,
						align : 'left',
						region : 'center',
						autoScroll : true,
						padding: 10,
						items : [{
							xtype: 'fieldset',
							title: 'パブリックメッセージ着信時',
							width: 400,
							items : [{
								id : 'notification_publicMsg_Field',
								xtype: 'checkbox',
								fieldLabel: '通知する',
								checked : false,
								handler : function(ckeckBox, checked) {
									configTmp.notification_publicMsg = checked;
									if (checked) {
										Ext.getCmp('notification_publicMsgTime_Field').enable();
									} else {
										Ext.getCmp('notification_publicMsgTime_Field').disable();
									}
								}
							}, {
								id : 'notification_publicMsgTime_Field',
								xtype: 'numberfield',
								fieldLabel: '通知時間(秒)',
								allowBlank : false,
								allowNegative : true,
								decimalPrecision : 1,
								minValue : -1,
								disabled : false,
								value : 0,
								listeners : (function() {
									var tip;
									return {
										render : function(owner) {
											tip = new Ext.ToolTip({
												target: owner.getEl(),
												bodyStyle : { whiteSpace : 'nowrap' },
												html: '"-1"を設定すると通知ポップアップは<br />表示されたままとなります'
											});
										},
										focus : function(e) { try { tip.show(); } catch(e) {} },
										blur : function(numField) {
											try { tip.hide(); } catch(e) {}
											if (numField.isValid()) {
												var val = numField.getValue();
												console.log('publicMsgTime:' + val);
												configTmp.notification_publicMsgTime = val;
											}
										}
									};
								})()
							}]
						}, {
							xtype: 'fieldset',
							title: 'プライベートメッセージ着信時',
							width: 400,
							items : [{
								id : 'notification_privateMsg_Field',
								xtype: 'checkbox',
								fieldLabel: '通知する',
								checked : false,
								handler : function(ckeckBox, checked) {
									configTmp.notification_privateMsg = checked;
									if (checked) {
										Ext.getCmp('notification_privateMsgTime_Field').enable();
									} else {
										Ext.getCmp('notification_privateMsgTime_Field').disable();
									}
								}
							}, {
								id : 'notification_privateMsgTime_Field',
								xtype: 'numberfield',
								fieldLabel: '通知時間(秒)',
								allowBlank : false,
								allowNegative : true,
								decimalPrecision : 1,
								minValue : -1,
								disabled : false,
								value : 0,
								listeners : (function() {
									var tip;
									return {
										render : function(owner) {
											tip = new Ext.ToolTip({
												target: owner.getEl(),
												bodyStyle : { whiteSpace : 'nowrap' },
												html: '"-1"を設定すると通知ポップアップは<br />表示されたままとなります'
											});
										},
										focus : function(e) { try { tip.show(); } catch(e) {} },
										blur : function(numField) {
											try { tip.hide(); } catch(e) {}
											if (numField.isValid()) {
												var val = numField.getValue();
												console.log('publicMsgTime:' + val);
												configTmp.notification_privateMsgTime = val;
											}
										}
									};
								})()
							}]
						}, {
							xtype: 'fieldset',
							title: 'ユーザ参加／退室時',
							width: 400,
							items : [{
								id : 'notification_userAddDel_Field',
								xtype: 'checkbox',
								fieldLabel: '通知する',
								checked : false,
								handler : function(ckeckBox, checked) {
									configTmp.notification_userAddDel = checked;
									if (checked) {
										Ext.getCmp('notification_userAddDelTime_Field').enable();
									} else {
										Ext.getCmp('notification_userAddDelTime_Field').disable();
									}
								}
							}, {
								id : 'notification_userAddDelTime_Field',
								xtype: 'numberfield',
								fieldLabel: '通知時間(秒)',
								allowBlank : false,
								allowNegative : true,
								decimalPrecision : 1,
								minValue : -1,
								disabled : false,
								value : 0,
								listeners : (function() {
									var tip;
									return {
										render : function(owner) {
											tip = new Ext.ToolTip({
												target: owner.getEl(),
												bodyStyle : { whiteSpace : 'nowrap' },
												html: '"-1"を設定すると通知ポップアップは<br />表示されたままとなります'
											});
										},
										focus : function(e) { try { tip.show(); } catch(e) {} },
										blur : function(numField) {
											try { tip.hide(); } catch(e) {}
											if (numField.isValid()) {
												var val = numField.getValue();
												console.log('userAddDelTime:' + val);
												configTmp.notification_userAddDelTime = val;
											}
										}
									};
								})()
							}]
						}, {
							xtype: 'fieldset',
							title: '通知音',
							width: 400,
							items : [{
								id : 'notification_sound_Field',
								xtype: 'checkbox',
								fieldLabel: '有効',
								checked : false,
								handler : function(ckeckBox, checked) {
									configTmp.notification_sound = checked;
								}
							}]
						}]
					}]
				}, {
					title: '画面操作',
					layout : 'border',
					autoScroll : true,
					items : [{
						border : false,
						align : 'left',
						region : 'center',
						autoScroll : true,
						padding: 10,
						items : [{
							xtype: 'fieldset',
							title: 'ショートカットキーの有効化',
							width: 400,
							labelWidth : 250,
							items : [{
								id : 'enable_ShortcutKeyCtrlEnter_Field',
								xtype: 'checkbox',
								fieldLabel: '送信（Ctrl+Enter）',
								checked : false,
								handler : function(ckeckBox, checked) {
									configTmp.enable_ShortcutKeyCtrlEnter = checked;
								}
							}, {
								id : 'enable_ShortcutKeyShiftEnter_Field',
								xtype: 'checkbox',
								fieldLabel: '小さい文字で送信（Shift+Enter）',
								checked : false,
								handler : function(ckeckBox, checked) {
									configTmp.enable_ShortcutKeyShiftEnter = checked;
								}
							}, {
								id : 'enable_ShortcutKeyAltEnter_Field',
								xtype: 'checkbox',
								fieldLabel: '大きい文字で送信（Alt+Enter）',
								checked : false,
								handler : function(ckeckBox, checked) {
									configTmp.enable_ShortcutKeyAltEnter = checked;
								}
							}]
						}]
					}]
				}]
			})
		]
	});
	
	var toolBar = new Ext.Toolbar({
		autoHeight : true,
		items: [
			' ',
			'状態',
			(function() {
				var store = new Ext.data.ArrayStore({
				    fields: ['state'],
				    data: (function() {
				    	var list = [];
				    	APP_CONFIG.USER_STATES.forEach(function(state) {
				    		list.push([state]);
				    	});
				    	return list;
				    })()
				});
				var enableEvent = true;
				return new Ext.form.ComboBox({
					id: 'myState',
					width: 100,
					editable: true,
					triggerAction: 'all',
					enableKeyEvents: true,
					mode: 'local',
					store: store,
					valueField: 'state',
					displayField: 'state',
					value: store.getAt(0).get('state'),
					listeners : {
						select : function(combo, record, index) {
							if (!enableEvent) { return; }
							var newState = combo.getValue();
							// console.log('newState: '+newState);
							socket.emit('user change', common.encryptByAES({
								name : myName,
								state : newState
							}, commonKey));
						},
						keydown : function(combo, event) {
							if (event.getKey() == 13) {
								var value = combo.getRawValue();
								// console.log(value);
								if (value == '') { return; }
								if (store.find('state', value) != -1) { return; }
								enableEvent = false;
								store.loadData([[value]], true);
								setTimeout(function() {
									enableEvent = true;
									combo.setValue(value);
									combo.fireEvent('select', combo, null, -1);
								}, 10);
								event.stopEvent();
								return false;
							}
						}
					}
				});
			})(),
			'-',
			{
				text : 'ダイレクト通信',
				listeners : {
					click : (function() {

						var peerConnection = null;
						var dataChannel = null;
						var myICE = [];
						var myUser = null;
						var directRequest = null;
						var directResponse = null;
						var channelOpened = false;

						function channelSetup() {
							dataChannel.onerror = function (error) {
								console.log("onerror:"+ error);
								console.log(error);
							};

							dataChannel.onmessage = function (event) {
								dataChannel.onmessage = function(){};
								console.log("onmessage:"+ event.data);
								console.log(event);

								var user = JSON.parse(event.data);
								var tabPanel = Ext.getCmp('tabPanel');
								var escapedUserID = Ext.util.Format.htmlEncode(user.id);
								if (Ext.getCmp('PrivateTab_' + escapedUserID) == null) {
									console.log('open new tab : ' + JSON.stringify(user));
									tabPanel.add(new DirectMessagePanel(user, myUser, peerConnection, dataChannel));
									tabPanel.doLayout();
								}
								tabPanel.setActiveTab('PrivateTab_' + escapedUserID);

								channelOpened = true;
								peerConnection = null;
								dataChannel = null;
							};

							dataChannel.onopen = function (event) {
								console.log("onopen");
								console.log(event);

								//ICEを解析し、自IPアドレスを取得
								var ipAddress = (function() {
									var s = '-';
									myICE.forEach(function(ice) {
										var candidate = '' + ice.candidate;
										if (/ tcp /.test(candidate) == false) {
											return;
										}
										var match = candidate.match(/ ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}) /);
										if (match != null) {
											s = match[1];
										}
									});
									return s;
								})();

								myUser = {
									id : 'direct_' + Math.random().toString(36).substring(2), //dummy値
									name : myName + ' <ダイレクト通信>',
									state : '-',
									host : ipAddress,
									addr : ipAddress,
									loginDate : new Date().getTime(),
									userAgent : navigator.userAgent
								};
								dataChannel.send(JSON.stringify(myUser));
							};

							dataChannel.onclose = function (event) {
								console.log("onclose");
								console.log(event);
								channelOpened = false;
							};
						}

						var cardPanel = null;
						var win = new Ext.Window({
							width : 500,
							height : 350,
							buttonAlign : 'center',
							closable : true,
							closeAction : 'hide',
							initHidden : true,
							hideMode : 'visibility',
							layout : 'fit',
							modal : false,
							resizable : true,
							title : 'ダイレクト通信セットアップ',
							listeners : {
								hide : function() {
									if (dataChannel != null) {
										dataChannel.close();
										dataChannel = null;
									}
									if (peerConnection != null) {
										peerConnection.close();
										peerConnection = null;
									}
								},
								show : function() {
									cardPanel.getLayout().setActiveItem(0);

									peerConnection = 
										new (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection)(null);
									console.log(peerConnection);
									dataChannel = null;
									myICE = [];
									directRequest = null;
									directResponse = null;
									channelOpened = false;

									peerConnection.onicecandidate = function(event) {
										console.log('peerConnection.onicecandidate');
										console.log(event);
										if (event.candidate) {
											console.log(event.candidate);
											myICE.push(event.candidate)
										}
									};
									peerConnection.ondatachannel = function(event) {
										console.log('peerConnection.ondatachannel');
										console.log(event);
										dataChannel = event.channel;
										console.log(dataChannel);
										channelSetup();
									};
								}
							},
							items : [{
								layout:'card',
								activeItem: 0,
								// layoutOnCardChange : true,
								defaults: {
									autoScroll : true,
									border: false,
									layout : 'vbox',
									layoutConfig : {
										defaultMargins : {top:10, right:0, bottom:0, left:0}
									}
								},
								listeners : {
									render : function(panel) {
										cardPanel = panel;
									}
								},
								items : [{
									// item 0
									defaults: {
										border: false,
										buttonAlign : 'center'
									},
									padding : '0px 10px 0px 10px',
									items: [{
										margins : {top:30, right:0, bottom:0, left:0},
										html : 'ダイレクト通信は、サーバを使用せず相手と１対１の直接通信を行います。'
									}, {
										margins : {top:15, right:0, bottom:0, left:0},
										buttons : [{
											text : '通信相手を招待する',
											width : 250, height : 50,
											handler : function() { cardPanel.getLayout().setActiveItem(1); }
										}]
									}, {
										margins : {top:15, right:0, bottom:0, left:0},
										buttons : [{
											text : '招待された相手と通信する',
											width : 250, height : 50,
											handler : function() { cardPanel.getLayout().setActiveItem(3); }
										}]
									}]
								}, (function() {
									// item 1
									var textArea = null;
									return {
										defaults: {
											border: false
										},
										padding : '0px 10px 0px 10px',
										listeners : {
											activate: function (panel) {
												textArea.setValue('');
												dataChannel = peerConnection.createDataChannel("WsChat_Direct_"+new Date().getTime());
												console.log(dataChannel);
												channelSetup();
												peerConnection.createOffer(function(offer) {
													console.log(offer);
													peerConnection.setLocalDescription(offer);

													var count = 0;
													function waitICE() {
														if (peerConnection.iceGatheringState != 'complete') {
															if (count++ > 6) {
																Ext.MessageBox.alert('エラー', '接続情報の生成に失敗しました。');
															} else {
																setTimeout(waitICE, 500);
															}
															return;
														}
														directRequest = {
															"offer" : offer,
															"ice" : myICE
														};
														console.log('directRequest');
														console.log(directRequest);
														textArea.setValue(btoa(JSON.stringify(directRequest)));
														setTimeout(function() { textArea.selectText(); }, 0);
													}
													waitICE();
												}, console.error);
											}
										},
										items : [{
											html : 'Step 1 of 2<br>以下の招待コードをコピーして、通信したい相手に伝えてください。<br>' +
												'伝えたら「次へ」を押してください。'
										}, {
											xtype: 'fieldset',
											title: '招待コード',
											border : true,
											items : [{
												xtype : 'textarea',
												width : 430, height : 130,
												hideLabel : true,
												readOnly : true,
												listeners : {
													render : function(self) {
														textArea = self;
													}
												}
											}]
										}, {
											buttons : [{
												text : '次へ',
												handler : function() { cardPanel.getLayout().setActiveItem(2); }
											}]
										}]
									};
								})(), (function() {
									// item 2
									var textArea = null;
									return {
										defaults: {
											border: false
										},
										padding : '0px 10px 0px 10px',
										listeners : {
											activate: function (panel) {
												textArea.setValue('');
												textArea.focus();
											}
										},
										items : [{
											html : 'Step 2 of 2<br>相手から応答コードを受け取り、以下に張り付けてください。<br>' +
												'(応答コードを受け取るまで、このウィンドウは閉じないでください)'
										}, {
											xtype: 'fieldset',
											title: '応答コード',
											border : true,
											items : [{
												xtype : 'textarea',
												width : 430, height : 130,
												hideLabel : true,
												readOnly : false,
												listeners : {
													render : function(self) {
														textArea = self;
													}
												}
											}]
										}, {
											buttons : [{
												text : '次へ',
												handler : function() {
													if (textArea.getValue() == '') { return; }
													directResponse = JSON.parse(atob(textArea.getValue()));
													var answer = new (window.RTCSessionDescription || window.mozRTCSessionDescription)(directResponse.answer);
													console.log(answer);
													peerConnection.setRemoteDescription(answer);

													directResponse.ice.forEach(function(ice) {
														var remoteIce = new (window.RTCIceCandidate || window.mozRTCIceCandidate)(ice);
														console.log(remoteIce);
														peerConnection.addIceCandidate(remoteIce);
													});
													cardPanel.getLayout().setActiveItem(5);
												}
											}]
										}]
									};
								})(), (function() {
									// item 3
									var textArea = null;
									return {
										defaults: {
											border: false
										},
										padding : '0px 10px 0px 10px',
										listeners : {
											activate: function (panel) {
												textArea.setValue('');
												textArea.focus();
											}
										},
										items : [{
											html : 'Step 1 of 2<br>相手から受け取った招待コードを、以下に張り付けてください。'
										}, {
											xtype: 'fieldset',
											title: '招待コード',
											border : true,
											items : [{
												xtype : 'textarea',
												width : 440, height : 130,
												hideLabel : true,
												readOnly : false,
												listeners : {
													render : function(self) {
														textArea = self;
													}
												}
											}]
										}, {
											buttons : [{
												text : '次へ',
												handler : function() {
													if (textArea.getValue() == '') { return; }

													directRequest = JSON.parse(atob(textArea.getValue()));

													var offer = new (window.RTCSessionDescription || window.mozRTCSessionDescription)(directRequest.offer);
													console.log(offer);
													peerConnection.setRemoteDescription(offer);

													directRequest.ice.forEach(function(ice) {
														var remoteIce = new (window.RTCIceCandidate || window.mozRTCIceCandidate)(ice);
														console.log(remoteIce);
														peerConnection.addIceCandidate(remoteIce);
													});

													peerConnection.createAnswer(function(desc) {
														console.log(desc);
														peerConnection.setLocalDescription(desc);

														var count = 0;
														function waitICE() {
															if (peerConnection.iceGatheringState != 'complete') {
																if (count++ > 6) {
																	Ext.MessageBox.alert('エラー', '接続情報の生成に失敗しました。');
																} else {
																	setTimeout(waitICE, 500);
																}
																return;
															}
															directResponse = {
																answer : desc,
																ice : myICE
															};
															console.log('directResponse');
															console.log(directResponse);
															cardPanel.getLayout().setActiveItem(4);
														}
														waitICE();
													}, console.error);
												}
											}]
										}]
									};
								})(), (function() {
									// item 4
									var textArea = null;
									return {
										defaults: {
											border: false
										},
										padding : '0px 10px 0px 10px',
										listeners : {
											activate: function (panel) {
												textArea.setValue(btoa(JSON.stringify(directResponse)));
												setTimeout(function() { textArea.selectText(); }, 0);
											}
										},
										items : [{
											html : 'Step 2 of 2<br>以下の応答コードをコピーして、通信したい相手に伝えてください。<br>' +
												'伝えたら「次へ」を押してください。'
										}, {
											xtype: 'fieldset',
											title: '応答コード',
											border : true,
											items : [{
												xtype : 'textarea',
												width : 440, height : 130,
												hideLabel : true,
												readOnly : true,
												listeners : {
													render : function(self) {
														textArea = self;
													}
												}
											}]
										}, {
											buttons : [{
												text : '次へ',
												handler : function() { cardPanel.getLayout().setActiveItem(5); }
											}]
										}]
									};
								})(), (function() {
									// item 5
									var loadMask = null;
									return {
										defaults: {
											border: false
										},
										listeners : {
											activate: function (panel) {
												if (loadMask == null) {
													loadMask = new Ext.LoadMask(panel.getEl(), { msg : "相手と接続中です。しばらくお待ちください..." });
												}
												loadMask.show();
												function waitConnect() {
													if (!channelOpened) {
														setTimeout(waitConnect, 3000);
														return;
													}
													cardPanel.getLayout().setActiveItem(6);
												}
												setTimeout(waitConnect, 1000);
											}
										},
										items : []
									};
								})(), {
									// item 6
									defaults: {
										border: false
									},
									padding : '0px 10px 0px 10px',
									items : [{
										html : '接続に成功しました。'
									}, {
										buttonAlign : 'left',
										buttons : [{
											text : '閉じる',
											handler : function() { win.hide(); }
										}]
									}]
								}]
							}],
							fbar : [{
								text : 'キャンセル',
								listeners : {
									click : function() {
										win.hide();
									}
								}
							}]
						});
						return function() {
							win.show();
						};
					})()
				}
			},
			'->',
			{
				text : 'デスクトップ通知を許可',
				listeners : {
					click : function() {
						if (!NotificationUtil.isSupported) {
							Ext.MessageBox.alert(
								'　',
								'お使いのブラウザはデスクトップ通知に対応していません。'
								+'<br />GoogleChromeの最新版をお使いください。'
							);
						} else if (NotificationUtil.checkPermission() != 'granted') {
							NotificationUtil.requestPermission(function() {
								console.log('permission:'+NotificationUtil.checkPermission());
							});
						} else {
							Ext.MessageBox.alert(
								'　',
								'デスクトップ通知は既に許可されています。'
							);
						}
					}
				}
			},
			'-',
			{
				text : '文字サイズ',
				menu : {
					xtype : 'menu',
					items : [
						'大',
						new Ext.slider.SingleSlider({
							height: 100,
							vertical : true,
							value: config.messagePanel_fontSize,
							increment: 10,
							minValue: 50,
							maxValue: 200,
							listeners : (function() {
								var chatMessageCSS = null;
								try {
									for (var i=0,l=document.styleSheets.length; i<l; i++) {
										var styleSheet = document.styleSheets[i];
										// console.log(styleSheet.title);
										if (styleSheet.title == 'wsChatCSS') {
											var rules = styleSheet.rules || styleSheet.cssRules;
											for (var m=0,n=rules.length; m<n; m++) {
												var rule = rules[m];
												// console.log(rule.selectorText);
												if (rule.selectorText == '.chatMessage') {
													chatMessageCSS = rule;
													break;
												}
											}
											break;
										}
									}
									if (chatMessageCSS != null) {
										chatMessageCSS.style.fontSize = (config.messagePanel_fontSize/100) + 'em';
										console.log('fontSize : ' + chatMessageCSS.style.fontSize);
									}
								} catch (e) { console.log(e); }
								// console.log('chatMessageCSS: '+chatMessageCSS);
								return {
									changecomplete : function(slider, newValue, thumb) {
										if (chatMessageCSS != null) {
											chatMessageCSS.style.fontSize = (newValue/100) + 'em';
											console.log('fontSize : ' + chatMessageCSS.style.fontSize);
											config.messagePanel_fontSize = newValue;
											localStorage.config = JSON.stringify(config);
										}
									}
								};
							})()
						}),
						'小'
					]
				}
			},
			'-',
			{
				text : '　設定　',
				listeners: {
					click : function() {
						configDialog.show();
					}
				}
			},
			'-',
			{
				text : '　ヘルプ　',
				listeners: {
					click : function() {
						Ext.MessageBox.alert(
							'ヘルプ',
							'・二人きりで会話したい場合は、参加者一覧から該当のユーザ行のアイコンをクリック！'
							+'<br />・ブラウザはGoogleChromeかFirefoxの最新版で！'
							+'<br />・気に入ったら美味しいビールおごって♪'
						);
					}
				}
			},
			'-',
			{
				text: 'ログアウト',
				listeners: {
					click : function() {
						Ext.MessageBox.show({
							buttons : Ext.MessageBox.OKCANCEL,
							title : '確認',
							msg : 'ログアウトしますか？',
							fn : function(buttonId) {
								if (buttonId == 'ok' && socket != null) { 
									socket.disconnect();
									//socket = null;
									Ext.MessageBox.alert(
										'',
										'ログアウトしました。再接続するにはブラウザをリロードしてください。'
									);
								}
							}
						});
					}
				}
			},
			' '
		]
	});
	
	var userGrid = new Ext.grid.GridPanel({
		id : 'userGrid',
		region:'east',
		margins:'2 2 0 0',
		split:true,
		autoScroll : true,
		collapsible : true,
		stripeRows : true,
		store: userStore,
		colModel: new Ext.grid.ColumnModel({
			defaults: {
				width: 120,
				editable : false,
				sortable : true
			},
			columns: [
				{
					xtype : 'actioncolumn',
					width : 20,
					//icon downloaded from http://www.material-land.com/view__1853__0.html
					icon : 'data:image/png;base64,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',
					tooltip: 'このユーザとのプライベート会話タブを開きます',
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						if (value == myID) {
							metaData.attr = 'style="visibility:hidden;"'
						}
						return null;
					},
					handler: function(grid, rowIndex, colIndex) {
						var record = grid.getStore().getAt(rowIndex);
						var user = record.data;
						if (user.id != myID) {
							addPrivateTab(user);
						}
					}
				},
   				{header: 'ID', dataIndex: 'id', hidden: true,
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						return Ext.util.Format.htmlEncode(value);
					}
   				},
   				{header: 'Name', dataIndex: 'name', width:100,
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						return Ext.util.Format.htmlEncode(value);
					}
   				},
   				{header: 'State', dataIndex: 'state', width:70,
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						return Ext.util.Format.htmlEncode(value);
					}
   				},
				{header: 'Host', dataIndex: 'host', width:70,
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						return Ext.util.Format.htmlEncode(value);
					}
				},
				{header: 'IP', dataIndex: 'addr', width:70,
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						return Ext.util.Format.htmlEncode(value);
					}
				},
				{header: 'LoginDate', dataIndex: 'loginDate', width: 150,
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						return Ext.util.Format.date(new Date(value),'H:i:s Y/m/d');
					}
				},
				{header: 'UserAgent', dataIndex: 'userAgent', width : 700,
					renderer: function(value, metaData, record, rowIndex, colIndex, store) {
						return Ext.util.Format.htmlEncode(value);
					}
				}
			]
		}),
		viewConfig: {
			forceFit: false
		},
		//sm: new Ext.grid.RowSelectionModel({singleSelect:true}),
		width: 320,
		frame: true,
		title: '参加者一覧',
		x: 0,
		y : 0
	});

	var tabPanel = new Ext.TabPanel({
		id : 'tabPanel',
		region:'center',
		// activeTab: 1,
		autoShow : true,
		enableTabScroll : true,
		margins:'2 2 0 0',
		listeners : {
			render : function(tabPanel) {
				tabPanel.setActiveTab(1);
				tabPanel.setActiveTab(0);
			},
			beforetabchange : function(tabPanel, newTab, currentTab) {
				setTimeout(function() {
					if (newTab) {
						newTab.doLayout();
						var id = newTab.getId();
						var text;
						if (id == 'MainTab') {
							text = Ext.getCmp('MainMsg');
						} else if (/PrivateTab_/.test(id)) {
							text = Ext.getCmp('PrivateMsg_' + id.replace(/PrivateTab_/, ''));
						}
						if (text) { 
							text.focus();
						}
					}
				}, 10);
			},
			tabchange : function(tabPanel, newTab) {
				if(newTab instanceof MessagePanel || newTab.getId() == 'PrivateMsgLogTab') {
					setTimeout(function() {
						// console.log('tabchange');
						newTab.findBy(function(child) {
							if (child instanceof MessageView) {
								child.items.each(function(child) {
									child.fireEvent('adjustSpacer');
								});
							}
						});
					}, 10);
				}
			},
			resize : (function() {
				var timer = null;
				return function(panel, adjWidth, adjHeight, rawWidth, rawHeight) {
					if (timer != null) {
						clearTimeout(timer);
						timer = null;
					}
					timer = setTimeout(function() {
						// console.log('resize');
						var currentTab = panel.getActiveTab();
						if (currentTab instanceof MessagePanel || currentTab.getId() == 'PrivateMsgLogTab') {
							currentTab.findBy(function(child) {
								if (child instanceof MessageView) {
									// console.log(child);
									child.items.each(function(child) {
										child.fireEvent('adjustSpacer');
									});
								}
							});
						}
						timer = null;
					}, 500);
				};
			})()
		},
		items:[
		new MessagePanel(null),
		{
			id : 'CanvasTab',
			title	: '共有お絵かき',
			layout : 'border',
			closable : false,
			items : [
			{
				xtype : 'toolbar',
				region : 'north',
				items : [
				'-',
				{
					xtype : 'button',
					text : '描画色',
					menu : {
						id : 'CanvasColor',
						xtype : 'colormenu',
						value : '000000',
						handler : function(palette, color) {
							console.log(color);
						}
					}
				},
				'-',
				{
					id : 'DrawSizeButton',
					xtype : 'button',
					text : '描画サイズ',
					menu : {
						xtype : 'menu',
						items : {
							xtype : 'panel',
							padding : 10,
							items : {
								id : 'CanvasDrawSizeGroup',
								xtype : 'radiogroup',
								vertical : true,
								columns : 1,
								width : 120,
								listeners : {
									change : function(group, radio) {
										setTimeout(function() { Ext.getCmp('DrawSizeButton').menu.hide(); }, 100);
									}
								},
								items : 
								[{
									xtype : 'radio',
									name : 'canvasDrawSize',
									boxLabel : 'サイズ_小',
									value : '小'
								}, {
									xtype : 'radio',
									name : 'canvasDrawSize',
									checked : true,
									boxLabel : 'サイズ_中',
									value : '中'
								}, {
									xtype : 'radio',
									name : 'canvasDrawSize',
									boxLabel : 'サイズ_大',
									value : '大'
								}]
							}
						}
					}
				},
				'-',
				{
					id : 'DrawLineButton',
					xtype : 'button',
					enableToggle : true,
					toggleGroup : 'CanvasToolsGroup',
					text : '線を描く'
				},
				' ',
				{
					id : 'DrawPointButton',
					xtype : 'button',
					enableToggle : true,
					toggleGroup : 'CanvasToolsGroup',
					text : '点を描く'
				},
				' ',
				{
					id : 'CanvasEraseButton',
					xtype : 'button',
					enableToggle : true,
					toggleGroup : 'CanvasToolsGroup',
					text : '消しゴム'
				},
				'-',
				{
					xtype : 'button',
					text : 'キャンバス全消去',
					listeners : {
						click : function() {
							var canvas = document.getElementById('MyCanvas');
							var ctx = canvas.getContext('2d');
							ctx.clearRect(0, 0, canvas.width, canvas.height);
							sendFigure({
								type : 'clear'
							});
						}
					}
				},
				'-'
				]
			}, {
				layout : 'fit',
				region : 'center',
				html : 
					'<div style="position:relative;">'
					+ 	'<canvas id="MyCanvas" style="position:absolute;top:0px;left:0px;background-color:ivory;"'
					+ 	' width="'+screen.availWidth+'" height="'+screen.availHeight+'">'
					+ 	'</canvas>'
					+ 	'<div id="MyCanvasTemporaryLayer" style="position:absolute;top:0px;left:0px;"></div>'
					+ 	'<img id="MyCanvasEventHandleLayer" style="position:absolute;top:0px;left:0px;'
					+ 		'width:'+screen.availWidth+'px;height:'+screen.availHeight+'px;" '
					+ 		'src="'+Ext.BLANK_IMAGE_URL+'" '
					+		'/>'
					+ '</div>',
				listeners : {
					afterrender : function(panel) {
						var canvas = document.getElementById('MyCanvas');
						var canvasTemporary = document.getElementById('MyCanvasTemporaryLayer');
						var canvasEventHandle = document.getElementById('MyCanvasEventHandleLayer');
						var drawBaseCommand = new DrawBase(canvas, canvasTemporary, canvasEventHandle);
						var drawLineCommand = new DrawLine(canvas, canvasTemporary, canvasEventHandle);
						var drawPointCommand = new DrawPoint(canvas, canvasTemporary, canvasEventHandle);
						var eraseRectCommand = new EraseRect(canvas, canvasTemporary, canvasEventHandle);
						var activeCommand = drawBaseCommand;
						Ext.getCmp('DrawLineButton').addListener('click', function(button, evt) {
							activeCommand.end();
							activeCommand = button.pressed ? drawLineCommand : drawBaseCommand;
							activeCommand.begin();
						});
						Ext.getCmp('DrawPointButton').addListener('click', function(button, evt) {
							activeCommand.end();
							activeCommand = button.pressed ? drawPointCommand : drawBaseCommand;
							activeCommand.begin();
						});
						Ext.getCmp('CanvasEraseButton').addListener('click', function(button, evt) {
							activeCommand.end();
							activeCommand = button.pressed ? eraseRectCommand : drawBaseCommand;
							activeCommand.begin();
						});
						Ext.EventManager.on(canvasEventHandle, 'mousedown', 
							function() { activeCommand.mousedown.apply(activeCommand, arguments) });
						Ext.EventManager.on(canvasEventHandle, 'mousemove', 
							function() { activeCommand.mousemove.apply(activeCommand, arguments) });
						Ext.EventManager.on(canvasEventHandle, 'mouseup', 
							function() { activeCommand.mouseup.apply(activeCommand, arguments) });
						Ext.EventManager.on(canvasEventHandle, 'mouseout', 
							function() { activeCommand.mouseup.apply(activeCommand, arguments) });
						var initButton = Ext.getCmp('DrawLineButton');
						initButton.pressed = true;
						initButton.fireEvent('click', initButton);
					}
				}
			}]
		},{
			id : 'PrivateMsgLogTab',
			title	: 'PrivateMsg過去ログ',
			layout : 'border',
			closable : false,
			items : [new MessageView({
				id : 'PrivateMsgLogView',
				title : 'プライベートメッセージの過去ログ（読み取り専用）',
				region:'center',
				autoScroll : true,
				bodyStyle : {
					backgroundColor : 'transparent !important'
				},
				items : [
				]
			})]
		}]
	});

	new Ext.Viewport({
		layout:'border',
		items:[
			{
				region : 'north',
				autoHeight : true,
				items : [toolBar]
			},
			userGrid, 
			tabPanel
		]
	});

	//データベースのセットアップ
	new Promise(function(resolve, reject) {
		var request = global.indexedDB.open('ws_chat', 7);
		request.onupgradeneeded = function(event) {
			var db = request.result;
			var storeNames = db.objectStoreNames;
			if (!storeNames.contains('publicMsg')) {
				var store = db.createObjectStore('publicMsg', {keyPath: 'time'});
				console.log(store);
			}
			if (!storeNames.contains('privateMsg')) {
				var store = db.createObjectStore('privateMsg', {keyPath: 'time'});
				console.log(store);
			}
		};
		request.onsuccess = function(event) {
			var db = request.result;
			wsChatDB = db;
			console.log(wsChatDB);
			resolve();
		};
		request.onerror = function(event) {
			console.log('indexedDB open error');
			console.log(arguments);
			reject(request.error);
		}
	}).then(function() {
		//余分なログデータの削除
		return Promise.all([
			new Promise(function(resolve, reject) {
				//パブリックメッセージ
				var tx = wsChatDB.transaction('publicMsg', 'readwrite');
				var store = tx.objectStore('publicMsg');
				var request = store.openCursor(null, 'prev');
				request.onsuccess = function() {
					var cursor = request.result;
					// console.log(request.result);
					if (cursor) {
						var val = cursor.value;
						if (val.favorite !== true) {
							//お気に入り設定されていないメッセージは全て削除
							console.log('log delete : ' + JSON.stringify(val));
							cursor.delete();
						}
						cursor.continue();
					} else {
						resolve();
					}
				};		
				request.onerror = function() {
					console.log('request.onerror');
					console.log(arguments);
					reject(request.error);
				};
			}),
			new Promise(function(resolve, reject) {
				//プライベートメッセージ
				var LOG_LIMIT = 100;
				var logCount = 0;
				var tx = wsChatDB.transaction('privateMsg', 'readwrite');
				var store = tx.objectStore('privateMsg');
				var request = store.openCursor(null, 'prev');
				request.onsuccess = function() {
					var cursor = request.result;
					// console.log(request.result);
					if (cursor) {
						var val = cursor.value;
						if (val.favorite !== true) {
							if (logCount > LOG_LIMIT) {
								console.log('log delete : ' + JSON.stringify(val));
								cursor.delete();
							} else {
								logCount++;
							}
						}
						cursor.continue();
					} else {
						resolve();
					}
				};		
				request.onerror = function() {
					console.log('request.onerror');
					console.log(arguments);
					reject(request.error);
				};
			})
		]);
	}).then(function() {
		Promise.all([
			//パブリックメッセージ読み込み
			new Promise(readDatabase('publicMsg')).then(function(dataList) {
				var msgPanel = Ext.getCmp('MainView');
				for (var i=0,l=dataList.length;i<l;i++) {
					msgAdd(msgPanel, dataList[i], !(l-i>1));
				}
			}),
			//プライベートメッセージ読み込み
			new Promise(readDatabase('privateMsg')).then(function(dataList) {
				var msgPanel = Ext.getCmp('PrivateMsgLogView');
				for (var i=0,l=dataList.length;i<l;i++) {
					msgAdd(msgPanel, dataList[i], !(l-i>1));
				}
			})
		]).then(function() {
			showInitDialog();		
		})
	});
});

function showInitDialog() {
	var reg = /name=([^&]+)/;
	var search = global.location.search || '';
	if (reg.test(search)) {
		myName = global.decodeURIComponent(search.match(reg)[1]);
		checkServer();
		return;
	}
	Ext.MessageBox.show({
 	   title:'ログイン',
 	   msg: 'あなたが使用する名前を入力してください。',
 	   buttons: Ext.Msg.OK,
 	   closable : false,
 	   prompt : true,
 	   fn: function(button, text) {
			if (text == null || text == '') {
				showInitDialog();
				return false;
			}
			myName = text;

			if (NotificationUtil.isSupported && NotificationUtil.checkPermission() != 'granted') {
				Ext.MessageBox.show({
			 	   title:'情報',
			 	   msg: '通知機能が有効になっていません。<br />デスクトップ通知を許可してください。',
			 	   buttons: Ext.Msg.OK,
			 	   closable : false,
			 	   fn: function(button, text) {
						NotificationUtil.requestPermission(function() {
							console.log('permission:'+NotificationUtil.checkPermission());
						});
						checkServer();
			 	   } ,
			 	   icon: Ext.MessageBox.INFO
			 	});
			} else {
				checkServer();
			}
 			return true;
 	   } ,
 	   icon: Ext.MessageBox.INFO
 	});
}

var checkServer = (function() {
	var messageBox = null;
	var retryCount = 0;
	return function() {
		Ext.Ajax.request({
			url: '/command/ping',
			success: function(response, opts) {
				if (messageBox != null && messageBox.isVisible()) {
					messageBox.getDialog().close();
				}
				if (retryCount > 0) {
					showDesktopPopup(
						'通知 ('+Ext.util.Format.date(new Date(),'Y/m/d H:i:s')+')',
						'サーバが起動しました。開始します。',
						-1);
					if (global.applicationCache != null && global.applicationCache.status == global.applicationCache.IDLE) {
						//アプリケーションの更新確認
						global.applicationCache.update();
					}
					retryCount = 0;
				}
				join();
			},
			failure: function(response, opts) {
				if (retryCount == 0 && (messageBox == null || !messageBox.isVisible())) {
					messageBox = Ext.MessageBox.alert(
				 	   '情報',
				 	   'サーバが起動していないようです。<br />サーバ起動後、チャットは自動的に開始しますので、このままでお待ちください。'
					);
				}
				retryCount++;
				setTimeout(checkServer, 5*60*1000)
			}
		});
	}
})();

function join() {

	var MAX_RECONNECTION_ATTEMPTS = 5;

	var path = global.location.protocol+'//'+global.location.host+'/';
	console.log('path: '+path);
	socket = io.connect(path, {
		'reconnect': true
		,'reconnection delay' : 3 * 1000
		// ,'reconnection limit' : 60 * 1000
		,'max reconnection attempts': MAX_RECONNECTION_ATTEMPTS
		// ,'connect timeout' : 5 * 1000
		// ,'try multiple transports' : false
	});
	socket.on('connect', function() {
		console.log('connect '+arguments.length);
		if (!connected) {
			socket.emit('handshake call');
		}
		connected = true;
	});
	socket.on('reconnect', function() {
		console.log('reconnect '+arguments.length);
		socket.emit('handshake call');
	});
	socket.on('reconnecting', function(waitTime, count) {
		console.log('reconnecting '+waitTime+' '+count);
		if (count >= MAX_RECONNECTION_ATTEMPTS) {
			socket.disconnect();
			showDesktopPopup(
				'通知 ('+Ext.util.Format.date(new Date(),'Y/m/d H:i:s')+')',
				'接続が切れました。再接続するにはブラウザをリロードしてください。',
				-1);
			Ext.MessageBox.alert(
				' ',
				'接続が切れました。再接続するにはブラウザをリロードしてください。');
			return false;
		}
	});
	socket.on('disconnect', function(event) {
		console.log('disconnect:'+JSON.stringify(arguments));
		if (event == 'booted') {
			Ext.MessageBox.alert(
				' ',
				'接続が切れました。再接続するにはブラウザをリロードしてください。');
		}
	});
	socket.on('connect_failed', function() {
		console.log('connect_failed:'+JSON.stringify(arguments));
		Ext.MessageBox.alert(
			' ',
			'サーバに接続できませんでした。再接続するにはブラウザをリロードしてください。');
	});
	socket.on('reconnect_failed', function() {
		console.log('reconnect_failed:'+JSON.stringify(arguments));
		Ext.MessageBox.alert(
			' ',
			'サーバに接続できませんでした。再接続するにはブラウザをリロードしてください。');
	});
	socket.on('error', function() {
		console.log('error:'+JSON.stringify(arguments));
		// Ext.MessageBox.alert(
		// 	' ',
		// 	'エラーが発生しました。再接続するにはブラウザをリロードしてください。');
	});

	socket.on('handshake reply', function(data) {
		var encryptedCommonKey = null;
		if (APP_CONFIG.ENCRYPTION) {
			var publicKey = data.publicKey;
			if (commonKey　== null) {
				//初回接続時のみ乱数生成
				var byteArray = cryptico.generateAESKey();
				commonKey = cryptico.bytes2string(byteArray);
				// console.log('byteArray: '+byteArray);
				// console.log('commonKey: '+commonKey);
			}
			var encryptResult = cryptico.encrypt(commonKey, publicKey);
			// console.log(JSON.stringify(encryptResult));
			encryptedCommonKey = encryptResult.cipher;
		}
		socket.emit('chat start', {
			name : myName,
			state : Ext.getCmp('myState').getValue(),
			reconnect : connected,
			encryptedCommonKey : encryptedCommonKey
		});
	});
	socket.on('error push', function(str) {
		var data = common.decryptByAES(str, commonKey);
		console.log('error push: '+JSON.stringify(data));
		var errorTitle = 'エラー';
		var errorMsg = 'エラーが発生しました。';
		switch(data.errorID) {
		case 'PRIVATEMSG_CALLBACK_UNCATCHED':
		case 'PRIVATEMSG_TARGET_NOT_EXIST':
			errorTitle = 'メッセージ送信エラー';
			errorMsg = 'プライベートメッセージを相手に届けることができませんでした。<br />' +
				'メッセージ送信用のTabを一度閉じてから、もう一度試してください。';
			break;
		}
		Ext.MessageBox.alert(errorTitle, errorMsg);
	});
	socket.on('chat setup', function(str) {
		var data = common.decryptByAES(str, commonKey);
		myID = data.myData.id;
		myName = data.myData.name;
		myHost = data.myData.host;
		myAddr = data.myData.addr;

		//共有メッセージのリセット
		// Ext.getCmp('MainView').removeAll(true);
		//共有お絵かきのリセット
		handleFigure({type : 'clear'})
		//参加者一覧のリセット
		userStore.removeAll();

		//参加者一覧のロード
		userStore.loadData(data);

		Ext.getCmp('MainMsg').focus();
	});
	socket.on('msg setup', function(str) {
		var data = common.decryptByAES(str, commonKey);
		//共有メッセージのロード
		var msgTab = Ext.getCmp('MainView');
		var msgList = data.msgList;
		console.log('msg setup:list='+msgList.length+' hasMore='+data.hasMore);

		for (var i=0,l=msgList.length;i<l;i++) {
			// console.log('msdAdd start');
			msgAdd(msgTab, msgList[i], !(l-i>1), true);
			// console.log('msdAdd end');
		}
		if (!data.hasMore) {
			msgTab.items.each(function(child) {
				child.fireEvent('adjustSpacer');
			});
			Ext.getCmp('MainMsg').focus();
		}
	});
	socket.on('figure setup', function(str) {
		var data = common.decryptByAES(str, commonKey);
		//共有お絵かきのロード
		var figureList = data.figureList;
		console.log('figure setup:list='+figureList.length+' hasMore='+data.hasMore);
		for (var i=0,l=figureList.length; i<l; i++) {
			handleFigure(figureList[i]);
		}
		if (!data.hasMore) {
			Ext.getCmp('MainMsg').focus();
		}
	});
	socket.on('user add', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var readResult = userStore.reader.readRecords(data);
		for (var i=0,l=readResult.records.length; i<l; i++) {
			userStore.addSorted(readResult.records[i]);
		}
		if (config.notification_userAddDel) {
			showDesktopPopup(
				'ユーザ参加',
				'「' + data.users.name + '」 が参加しました。',
				config.notification_userAddDelTime
			);
		}
	});
	socket.on('user change', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var storeIndex = userStore.find('id', data.id);
		if (storeIndex != -1) {
			var record = userStore.getAt(storeIndex);
			var oldState = record.get('state');
			for (var i in data) {
				if (i == 'id') { continue; }
				record.set(i, data[i]);
			}
			record.commit();
			var row = Ext.getCmp('userGrid').getView().getRow(storeIndex);
			Ext.fly(row).highlight();
			if (record.get('id') != myID && config.notification_userAddDel) {
				showDesktopPopup(
					'ユーザ状態変更',
					data.name + '： "' + oldState + '" → "' + data.state + '"',
					config.notification_userAddDelTime
				);
			}
		}
	});
	socket.on('user delete', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var storeIndex = userStore.find('id', data.id);
		if (storeIndex != -1) {
			userStore.removeAt(storeIndex);
			if (config.notification_userAddDel) {
				showDesktopPopup(
					'ユーザ退室',
					'「' + data.name + '」 が退室しました。',
					config.notification_userAddDelTime
				);
			}
		}
	});
	socket.on('message push', function(encryptedData, noEncryptedData, callbackFn) {
		var data = common.decryptByAES(encryptedData, commonKey);
		//console.log('callbackFn: '+fn);
		handleMessage(myID, data, noEncryptedData, callbackFn);
	});
	socket.on('message delete', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var targetPanel = Ext.getCmp('MainView');
		var targetItems = targetPanel.items;
		var removeList = [];
		// console.log(data);
		for (var i=0,l=targetItems.length; i<l; i++) {
			var targetItem = targetItems.get(i);
			var targetItemData = targetItem.initialConfig.data;
			// console.log(targetItem.initialConfig.data);
			var equals = true;
			for (var prop in data) {
				if (data[prop] != targetItemData[prop]) {
					equals = false;
					break;
				}
			}
			if (equals) {
				removeList.push(targetItem);
				targetItemData.favorite = false; //お気に入りを外すことで、データベースからも削除する
			}
		}
		for (var i=0,l=removeList.length; i<l; i++) {
			(function(targetItem) {
				targetItem.getEl().slideOut('r', {
					duration: 0.5,
					callback : function() {
						targetPanel.remove(targetItem, true);
					}
				});
			})(removeList[i]);
		}
	});
	socket.on('read notification', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var unreadLabel = Ext.getCmp('unreadLabel_' + Ext.util.Format.htmlEncode(data.from) + '_' + data.time);
		if (unreadLabel != null) {
			unreadLabel.destroy();
		}
	});
	socket.on('figure push', function(str) {
		var data = common.decryptByAES(str, commonKey);
		console.log('figure push: ');
		handleFigure(data);
	});
}

function sendMessage(data, noEncryptData) {
	if (socket == null || socket.socket == null || socket.socket.connected == false) {
		Ext.MessageBox.alert('　', 'サーバに接続していないため、メッセージを送ることができませんでした。');
		return;
	}
	socket.emit('message send', common.encryptByAES(data, commonKey), noEncryptData);
}

function handleMessage(myUserID, data, noEncryptedData, callbackFn) {
	// console.log(data);
	var tabID;
	var msgPanel;
	if (data.isPrivate) {
		var openID = 
			(data.msgTarget == myUserID) ? data.id : data.msgTarget;
		var escapedOpenID = Ext.util.Format.htmlEncode(openID);
		tabID = 'PrivateTab_' + escapedOpenID;
		msgPanel = Ext.getCmp('PrivateView_' + escapedOpenID);
		if (msgPanel == null) {
			var record = userStore.query('id', openID);
			if (record != null && record.length > 0) {
				addPrivateTab(record.get(0).data);
			}
			msgPanel = Ext.getCmp('PrivateView_' + escapedOpenID);
		}
	} else {
		tabID = 'MainTab';
		msgPanel = Ext.getCmp('MainView');
	}
	if (noEncryptedData != null) {
		data = Ext.apply(data, noEncryptedData); //画像データをマージ
	}
	msgAdd(msgPanel, data);
	if (data.id != myUserID) {
		if (data.isPrivate && callbackFn != null) {
			callbackFn('private message catched.');
		}
		var forcePopup = (data.effect&(1<<3)) == (1<<3) || (function(msg) {
			var matched = msg.match(/^[@＠>＞](\S+)(\s.+)?/);
			if (matched == null) { return false; }
			var checkMsg = matched[1];
			function containsMyName(splitter) {
				var names = checkMsg.split(splitter);
				for (var i=0,l=names.length; i<l; i++) {
					var name = names[i].trim();
					if (name == myName) { return true; }
					for (var m=0,n=APP_CONFIG.HONORIFIC_TITLES.length; m<n; m++) {
						if (name == (myName+APP_CONFIG.HONORIFIC_TITLES[m])) { return true; }
					}
				}
				return false;
			}
			return containsMyName(',') || containsMyName('、');
		})(data.msg);
		if (
			(data.isPrivate && config.notification_privateMsg) ||
			(!data.isPrivate && config.notification_publicMsg) ||
			forcePopup
		) {
			showDesktopPopup(
				data.name + ' からの' + (data.isPrivate ? 'プライベート' : '') + 'メッセージ' + (forcePopup ? '(*)' : ''),
				data.useReadNotification ? '（開封確認メッセージ）' : data.msg,
				forcePopup ? -1 : 
					(data.isPrivate ?
						config.notification_privateMsgTime : 
						config.notification_publicMsgTime),
				tabID,
				function() {
					//開封ボタンを押したことにする
					if (data.useReadNotification) {
						var readButton = Ext.getCmp('readButton_' + Ext.util.Format.htmlEncode(data.id) + '_' + data.time);
						if (readButton != null && readButton.isVisible()) {
							readButton.fireEvent('click', readButton);
						}
					}

					//クリックされたメッセージ位置にフォーカスする
					var targetMsg = null;
					for (var i=0,l=msgPanel.items.length; i<l; i++) {
						var msg = msgPanel.items.get(i);
						if (msg.initialConfig.data == data) {
							targetMsg = msg;
							break;
						}
					}
					if (targetMsg != null) {
						var scrollVal = targetMsg.getPosition()[1] - msgPanel.getPosition()[1];
						msgPanel.body.scroll(scrollVal > 0 ? 'down' : 'up', Math.abs(scrollVal), true);
						setTimeout(function() {
							targetMsg.getEl().frame();
						}, 300);
					}
				}
			);
		}
	}
	if (data.isPrivate) {
		var addedPanel = msgAdd(Ext.getCmp('PrivateMsgLogView'), data);

		//プロパティの変更を監視している処理を実行させ、DBに保存させる
		addedPanel.initialConfig.data.favorite = false;
	}
}

var msgAdd = (function() {
	var imageDef = null;
	var imageID = 'MainImageView_'+new Date().getTime();
	var imageViewWin = new Ext.Window({
		//autoWidth : true,
		minWidth : 100,
		width : 500,
		//autoHeight : true,
		minHeight : 100,
		height : 350,
		buttonAlign : 'center',
		closable : true,
		closeAction : 'hide',
		initHidden : true,
		layout : 'fit',
		hideMode : 'visibility',
		modal : true,
		resizable : true,
		title : '画像',
		items : [
		{
			autoScroll : true,
			border : false,
			html : '<img id="'+imageID+'" style="border:1px solid silver;cursor:pointer;" />'
		}
		],
		listeners : {
			beforeshow : function(win) {
				if (imageDef != null) {
					document.getElementById(imageID).src = imageDef.imageData;
					var winWidth = Math.min(imageDef.imageWidth+win.getFrameWidth()+Ext.getScrollBarWidth(), Math.floor(Ext.getBody().getWidth()*0.9));
					winWidth = Math.max(winWidth, 150);
					var winHeight = Math.min(imageDef.imageHeight+win.getFrameHeight()+Ext.getScrollBarWidth(), Math.floor(Ext.getBody().getHeight()*0.8));
					winHeight = Math.max(winHeight, 100);
					// console.log(winWidth + ' : ' + winHeight);
					win.setSize(winWidth, winHeight);
					win.center();
				}
			},
			render : function(win) {
				win.body.on('click', function() {
					win.hide();
				});
			}
		},
		fbar : [
		{
			text : '閉じる',
			listeners : {
				click : function() {
					imageViewWin.hide();
				}
			}
		}
		]
	});
	// imageViewWin.show();
	// imageViewWin.hide();
	return function(targetPanel, _data, doLayout, sort) {
		if (doLayout == null) { doLayout = true; }
		if (sort == null) { sort = false; }
		var headerDefaultStyle = {
			marginRight : '10px',
			whiteSpace: 'nowrap',
			color : 'silver',
			fontSize : 'small'
		};
		var headerId = null;
		var spacerId = null;
		var msgPanel = null;
		var adjustSpacer = function() {
			// console.log(headerId +', '+ spacerId);
			if (headerId == null || spacerId == null) { return; }
			var header = Ext.getCmp(headerId);
			var spacer = Ext.getCmp(spacerId);
			var spacerWidth = spacer.getWidth();
			var totalWidth = 0;
			header.items.each(function(child) {
				totalWidth += child.getWidth();
			});
			totalWidth -= spacerWidth;
			// console.log(header.getWidth() +'-'+ totalWidth);
			if ((header.getWidth() - totalWidth) > 10) {
				spacer.setWidth(header.getWidth() - totalWidth);
			} else {
				spacer.setWidth(10);
			}
			msgPanel.doLayout();
		};

		//データが変更されたら、DBを更新する
        var data = new Proxy(_data, {
            set: function(target, property, value, receiver) {
                target[property] = value;
                if (property != 'favorite') {
                    return true;
                }
                var tx = wsChatDB.transaction(target.isPrivate ? 'privateMsg' : 'publicMsg', 'readwrite');
                // console.log(tx);
                var store = tx.objectStore(target.isPrivate ? 'privateMsg' : 'publicMsg');
                // console.log(target);
                store.put(target);
                tx.oncomplete = function() {
                    // console.log('transaction complete');
                    // console.log(arguments);
                };
                tx.onabort = function() {
                    console.log('transaction abort');
                    console.log(arguments);
                };
                tx.onerror = function() {
                    console.log('transaction error');
                    console.log(arguments);
                };
                return true;
            }
        });

		msgPanel = new Ext.Panel({
			autoWidth : true,
			autoHeight : true,
			padding : 5,
			data : data,
			listeners : {
				adjustSpacer : function() {
					adjustSpacer();
				}
			},
			items : 
			[{
				layout : 'column',
				border : false,
				items : (function() {
					var items = [];
					items.push(
					{
						border : false,
						columnWidth: 1,
						listeners : {
							afterrender : function(self, width, height) {
								setTimeout(adjustSpacer, 0);
							}
						},
						items : [{
							autoWidth : true,
							autoHeight : true,
							// height : 50,
							layout : 'hbox',
							// layoutConfig : {
							// 	align : 'stretch'
							// },
							border : false,
							// bodyStyle : {
							// 	height : '1em'
							// },
							defaults:{
								border : false,
								bodyStyle : headerDefaultStyle
							},
							listeners : {
								render : function(self) {
									headerId = self.getId();
								}
							},
							items : (function() {
								var items = [];
								items.push({
									html : Ext.util.Format.htmlEncode(data.name) 
										+ ((data.state == null) ? '' :
											'('
											+ Ext.util.Format.htmlEncode(data.state)
											+ ')'
										)
										+ '&nbsp;'
										+ Ext.util.Format.htmlEncode(data.host) 
										+ '('
										+ Ext.util.Format.htmlEncode(data.addr)
										+ ')'
								});
								items.push({
									html : '&nbsp;',
									listeners : {
										render : function(self) {
											spacerId = self.getId();
										}
									}
								});
								// items.push({
								// 	xtype : 'spacer',
								// 	flex: 1,
								// });
								items.push({
									html : Ext.util.Format.htmlEncode(
											Ext.util.Format.date(new Date(data.time),'Y/m/d')
										) 
										+ '&nbsp;'
										+ Ext.util.Format.htmlEncode(
											Ext.util.Format.date(new Date(data.time),'H:i:s')
										) 
								});
								if (data.isPrivate &&
										data.msgTarget != myID && 
										data.useReadNotification &&
										targetPanel.getId() != 'PrivateMsgLogView') {
									items.push({
										id : 'unreadLabel_' + Ext.util.Format.htmlEncode(data.msgTarget) + '_' + data.time,
										bodyStyle : Ext.applyIf({color : 'red'}, headerDefaultStyle),
										html : '(未読)',
										listeners : {
											destroy : function(self) {
												// msgPanel.doLayout();
												adjustSpacer();
											}
										}
									});
								}
								return items;
							})()
						}]
					});

					if (data.id == myID　&& !data.isPrivate) {
						items.push({
							xtype : 'button',
							text : '削除',
							listeners : {
								click : function() {
									socket.emit('message delete', common.encryptByAES({
									   	'time' : data.time
									}, commonKey));
								}
							}
						});
					}

					if (targetPanel.getId() == 'MainView' || targetPanel.getId() == 'PrivateMsgLogView') {
						items.push({
							xtype : 'panel',
							html : ' ',
							border : false,
							width : 15,
							height : 15,
							bodyCssClass : !!data.favorite ? 'clipButton_on' : 'clipButton_off',
							bodyStyle : { cursor : 'pointer'},
							listeners : (function() {
								var tip;
								return {
									render : function(owner) {
										tip = new Ext.ToolTip({
											target: owner.getEl(),
											bodyStyle : { whiteSpace : 'nowrap' },
											html: '',
											listeners : {
												show : function() {
													tip.update(!data.favorite ? 'このメッセージをピン留めする' : 'このメッセージのピン留めを外す');
													tip.doLayout();
												}													
											}
										});

										owner.getEl().addListener('click', function() {
											data.favorite = !data.favorite;
											owner.body.removeClass('clipButton_on');
											owner.body.removeClass('clipButton_off');
											owner.body.addClass(!!data.favorite ? 'clipButton_on' : 'clipButton_off');
										});
									}
								};
							})()
						});
					}
					return items;
				})()

			}, {
				autoWidth : true,
				autoHeight : true,
				// height : 100,
				border : false,
				bodyStyle : {
					height : '1em'
				},
				layout : 'column',
				items : (function() {
					var items = [];
					var isShowOpenButton = (data.isPrivate &&
							data.msgTarget == myID && 
							data.useReadNotification &&
							targetPanel.getId() != 'PrivateMsgLogView'
							);
					var msgID = targetPanel.getId() + '_msg_' + data.time;
					var msgImageID = targetPanel.getId() + '_msgImage_' + data.time;
					if (isShowOpenButton) {
						items.push({
							xtype : 'button',
							id : 'readButton_' + Ext.util.Format.htmlEncode(data.id) + '_' + data.time,
							text : '開封する',
							columnWidth: 1,
							style : {
								height : '2.5em'
							},
							listeners : {
								render : function(button) {
									button.getEl().dom.getElementsByTagName('button')[0].style.letterSpacing = '0.8em';
								},
								click : function(button) {
									button.hide();
									Ext.getCmp(msgID).show();
									if (Ext.getCmp(msgImageID) != null) {
										Ext.getCmp(msgImageID).show();
									}
									socket.emit('read notification', common.encryptByAES({
										from : myID,
										to : data.id,
										time : data.time,
										name : myName
									}, commonKey));
								}
							}
						});
					}
					items.push({
						id : msgID,
						// height : 50,
						autoHeight : true,
						// autoWidth : true,
						columnWidth　: .99,
						hidden : (isShowOpenButton),
						border : false,
						bodyStyle : {
							height : '1em;'
							, wordBreak : 'break-all'
							, fontFamily : "'メイリオ',Meiryo,sans-serif"
							// , fontFamily : 'monospace'	//等幅フォント
						},
						bodyCssClass : 'chatMessage',
						html : (function() {
							var str = Ext.util.Format.htmlEncode(''+data.msg);
							// console.log(JSON.stringify(str));
							var replaceRules = [
								[
									/(https?\:\/\/(?:[a-zA-Z0-9\-\_\.\!\?\~\*\;\:\/\@\&\=\+\$\,\%\#\(\)\[\]\'\^\\]+(?=&gt;)|[a-zA-Z0-9\-\_\.\!\?\~\*\;\:\/\@\&\=\+\$\,\%\#\(\)\[\]\'\^\\]+))/g,
									/(https?\:\/\/(?:[a-zA-Z0-9\-\_\.\!\?\~\*\;\:\/\@\&\=\+\$\,\%\#\(\)\[\]\'\^\\]+(?=&gt;)|[a-zA-Z0-9\-\_\.\!\?\~\*\;\:\/\@\&\=\+\$\,\%\#\(\)\[\]\'\^\\]+))/g,
									function() {
										var url = arguments[1];
										var decodedURL = url;
										try {
											decodedURL = global.decodeURI(decodedURL);
										} catch(e) {}
										return '<a target="_blank" style="text-shadow: 1px 0px 1px white;" href="'+url+'">'+decodedURL+'</a>'
									}
								],
								[
									/((?:&lt;|&quot;)(?:\\\\|[a-zA-Z]:\\).+?(?:&gt;|&quot;))/g,
									/(?:&lt;|&quot;)((?:\\\\|[a-zA-Z]:\\).+?)(?:&gt;|&quot;)/g,
									function() {
										var url = arguments[1];
										var hrefUrl = url;
										if (!Ext.isIE) {
											hrefUrl = global.encodeURI(hrefUrl.replace(/\\/g, '/'));
											hrefUrl = 'file:' + (hrefUrl.indexOf('/')==0 ? '' : '///') + hrefUrl;
										}
										var firstChar = arguments[0].indexOf('&lt;') == 0 ? '&lt;' : '&quot;';
										var lastChar = arguments[0].lastIndexOf('&gt;') == arguments[0].length-4 ? '&gt;' : '&quot;';
										return firstChar + '<a target="_blank" style="text-shadow: 1px 0px 1px white;" href="'+hrefUrl+'">'+url+'</a>' + lastChar;
									}
								]
							];
							function doReplace(str, ruleIndex) {
								if (ruleIndex == replaceRules.length) { return str; }
								var splitReg = replaceRules[ruleIndex][0];
								var replaceReg = replaceRules[ruleIndex][1];
								var replaced = replaceRules[ruleIndex][2];
								var split = str.split(splitReg);
								// console.log('split('+ruleIndex+'): '+JSON.stringify(split));
								var newStr = '';
								for (var i=0,l=split.length; i<l; i++) {
									if (i%2 == 0) {
										newStr += doReplace(split[i], ruleIndex+1); 
										continue;
									} else {
										var before = split[i];
										var after = before.replace(replaceReg, replaced).replace(/ /g, '\u0000'); 
										// console.log('before: '+before);
										// console.log('after: '+after);
										newStr += after;
									}
								}
								return newStr;
							}
							str = doReplace(str, 0);
							str = str.replace(
								/\t/g,
								'&nbsp;&nbsp;&nbsp;&nbsp;');
							str = str.replace(
								/\r\n|\n/g,
								'<br\u0000/>');
							str = str.replace(
								/ /g,
								'&nbsp;');
							str = str.replace(
								/\u0000/g,
								' ');

							if (data.color != null && data.color != '') {
								str = '<span style="color:'+data.color+';">'+str+'</span>';
							}
							if ((data.effect & (1<<0)) == (1<<0)) {
								str = '<div style="font-size:0.6em;">'+str+'</div>';
							}
							if ((data.effect & (1<<1)) == (1<<1)) {
								str = '<div style="font-size:2em;">'+str+'</div>';
							}
							if ((data.effect & (1<<2)) == (1<<2)) {
								str += '<div style="font-size:0.6em;text-align:right;">※このメッセージは'+APP_CONFIG.DELETE_MSG_TIMER_SECONDS+'秒後に消去されます</div>';
							}

							return str;
						})()
					});
					if (typeof(data.imageData) == 'string') {
						var width = Math.min(data.imageWidth, 128);
						items.push({
							id : msgImageID,
							hidden : (isShowOpenButton),
							border : true,
							width : width,
							html : '<img style="max-width:'+width+'px;cursor:pointer;"' +
								' src="'+data.imageData+'" />',
							listeners : {
								render : function(panel) {
									panel.body.on('click', function() {
										imageDef = {
											imageData : data.imageData,
											imageWidth : data.imageWidth,
											imageHeight : data.imageHeight
										};
										imageViewWin.show();
									});
								}
							}
						});
					} else if (data.imageData === true) {
						items.push({
							id : msgImageID,
							hidden : (isShowOpenButton),
							border : true,
							width : 48,
							height : 48,
							html : '<img style="cursor:pointer;margin:8px;"' +
								' src="/extjs/resources/images/default/window/icon-error.gif" />',
							listeners : {
								render : function(panel) {
									panel.body.on('click', function() {
										alert('画像データがありません。');
									});
								}
							}
						});
					}
					return items;
				})()
			}]
		});
		if (doLayout) { msgPanel.doLayout(); }
		//_msgPanel = msgPanel;
		if (targetPanel.items.length > 0xFF) {
			var items = targetPanel.items;
			for (var i=items.getCount()-1; i>=0; i--) {
				var item = items.itemAt(i);
				var itemData = item.initialConfig.data;
				if (itemData.favorite !== true) {
					targetPanel.remove(item, true);
					break;
				}
			}
		}

		var items = targetPanel.items;
		var itemsCount = items.getCount();
		if (sort && itemsCount > 0) {
			for (var i=0,l=itemsCount; i<l; i++) {
				var itemData = items.itemAt(i).initialConfig.data;
				if (data.time > itemData.time) {
					targetPanel.insert(i, msgPanel);
					break;
				} else if (data.id == itemData.id && data.time == itemData.time) {
					//保存済みデータが既に表示済みの場合は、追加しない
					break;
				} else if (i == (l-1)) {
					targetPanel.insert(i+1, msgPanel);
					break;
				}
			}
		} else {
			//一番上に追加
			targetPanel.insert(0, msgPanel);
		}

		if (doLayout) { targetPanel.doLayout(); }
        
        return msgPanel;
	};
})();

var showDesktopPopup = (function() {
	var timerTable = {};
	return function(title, msg, showTime, focusTabID, clickedCallback) {
		// console.log('NotificationUtil.isSupported: ' + NotificationUtil.isSupported);
		// console.log('NotificationUtil.checkPermission: ' + NotificationUtil.checkPermission());
		if (clickedCallback == null) { clickedCallback = function(){} }
		if (
			NotificationUtil.isSupported &&
			NotificationUtil.checkPermission() == 'granted'
		) {
			var notifyMsg = (msg.length > 36) ? (msg.substring(0,35)+'...') : (msg);
			var notify = NotificationUtil.createNotification(
				title,
				{
					iconUrl : './extjs/resources/images/default/window/icon-info.gif',
					body : notifyMsg
				},
				{
					onclick : function(event) {
						for (var i in timerTable) {
							// クリックされた時点で、他の通知の自動クローズを解除する
							// console.log('timer:'+i);
							clearTimeout(i);
							delete timerTable[i];
						}
						this.close();
						if (focusTabID != null) {
							var tabPanel = Ext.getCmp('tabPanel');
							tabPanel.setActiveTab(focusTabID);
						}
						setTimeout(function() {
							if (document.hidden === true) {
								alert(title + '：\n' + msg);
							}
							clickedCallback();
						}, 0);
					},
					onshow : function() {
						if (showTime > 0) {
							var self = this;
							var timer = setTimeout(function() { 
									self.close(); 
									delete timerTable[timer];
								}, 
								showTime * 1000
							);
							timerTable[timer] = true;
						}
					}
				}
			);
			if (config.notification_sound === true) {
				document.getElementById('notificationAudio').play();
			}
		}
	};
})();

function addPrivateTab(user) {
	var tabPanel = Ext.getCmp('tabPanel');
	var escapedUserID = Ext.util.Format.htmlEncode(user.id);
	if (Ext.getCmp('PrivateTab_' + escapedUserID) == null) {
		console.log('open new tab : ' + JSON.stringify(user));
		tabPanel.add(new MessagePanel(user));
		tabPanel.doLayout();
	}
	tabPanel.setActiveTab('PrivateTab_' + escapedUserID);
}


function sendFigure(data) {
	if (socket == null || socket.socket == null || socket.socket.connected == false) {
		Ext.MessageBox.alert('　', 'サーバに接続していないため、メッセージを送ることができませんでした。');
		return;
	}
	socket.emit('figure send', common.encryptByAES(data, commonKey));
}
function handleFigure(data) {
	var canvas = document.getElementById('MyCanvas');
	var context = canvas.getContext('2d');
	switch(data.type) {
	case 'line':
		var paths = data.paths;
		context.strokeStyle = data.color || '#000000';
		context.lineWidth = data.width != null ? data.width : 2;
		context.lineCap = 'round';
		context.beginPath();
		context.moveTo(paths[0][0], paths[0][1]);
		for (var i=1,l=paths.length; i<l; i++) {
			context.lineTo(paths[i][0], paths[i][1]);
		}
		context.stroke();
		context.closePath();
		break;
	case 'point':
		var paths = data.paths;
		var color = data.color || '#000000';
		var size = data.size != null ? data.size : 2;
		context.beginPath();
		context.strokeStyle = color;
		context.fillStyle = color;
		context.arc(paths[0], paths[1], size, 0, 360, true);
		context.fill();
		context.closePath();
		break;
	case 'erase':
		var points = data.points;
		var size = data.size != null ? data.size : 30;
		for (var i=0,l=points.length; i<l; i++) {
			var xy = points[i];
			context.clearRect(xy[0]-(size/2), xy[1]-(size/2), size, size);
		}
		break;
	case 'clear':
		context.clearRect(0, 0, canvas.width, canvas.height);
		break;
	}
}

var DrawBase = Ext.extend(function(){}, {
	canvas : null,
	context : null,
	canvasTemporary : null,
	canvasEventHandle : null,
	constructor : function(canvas, canvasTemporary, canvasEventHandle) { 
		this.canvas = canvas;
		this.context = canvas.getContext('2d');
		this.canvasTemporary = canvasTemporary;
		this.canvasEventHandle = canvasEventHandle;
		// console.log('constructor: '+this.canvas+' '+this.context+' '+this.canvasTemporary+' '+this.canvasEventHandle);
	},
	getXY : function(evt) {
		var bEvt = evt.browserEvent;
		return [
			(bEvt.offsetX != null ? bEvt.offsetX : bEvt.layerX),
			(bEvt.offsetY != null ? bEvt.offsetY : bEvt.layerY)
		];
	},
	begin : function() {},
	mousedown : function(evt, element) {},
	mousemove : function(evt, element) {},
	mouseup : function(evt, element) {},
	end : function() {
		var tmp = this.canvasTemporary;
		while (tmp.firstChild != null) {
			tmp.removeChild(tmp.firstChild);
		}
	}
});
var DrawLine = Ext.extend(DrawBase, {
	isDrawing : false,
	oldX : -1,
	oldY : -1,
	pathList : null,
	color : '#000000',
	width : 4,
	mousedown : function(evt, element) {
		var xy = this.getXY(evt);
		this.oldX = xy[0];
		this.oldY = xy[1];
		this.pathList = [];
		this.pathList.push([this.oldX, this.oldY]);
		this.color = '#'+Ext.getCmp('CanvasColor').palette.value;
		this.context.strokeStyle = this.color;
		var widthCmp = Ext.getCmp('CanvasDrawSizeGroup');
		if (widthCmp != null && widthCmp.getValue() != null) {
			switch (widthCmp.getValue().value) {
				case '小': this.width = 2; break;
				case '中': this.width = 4; break;
				case '大': this.width = 8; break;
			}
		}
		this.context.lineWidth = this.width;
		this.context.lineCap = 'round';
		this.isDrawing = true;
		console.log('mousedown: '+this.oldX+','+this.oldY);
		evt.stopEvent();
	},
	mousemove : function(evt, element) {
		if (!this.isDrawing) { return; }
		var xy = this.getXY(evt);
		var x = xy[0];
		var y = xy[1];
		if (Math.abs(x - this.oldX) > 5 || Math.abs(y - this.oldY) > 5) {
			this.context.beginPath();
			this.context.moveTo(this.oldX, this.oldY);
			this.context.lineTo(x, y);
			this.context.stroke();
			this.context.closePath();
			this.pathList.push([x, y]);
			console.log('mousemove: ('+this.oldX+','+this.oldY+') -> ('+x+','+y+')');
			this.oldX = x;
			this.oldY = y;
		}
	},
	mouseup : function(evt, element) {
		if (!this.isDrawing) { return; }
		this.isDrawing = false;
		console.log('mouseup: '+this.pathList);
		if (this.pathList.length > 1) {
			sendFigure({
				type : 'line',
				color : this.color,
				width : this.width,
				paths : [].concat(this.pathList)
			});
		}
	}
});
var DrawPoint = Ext.extend(DrawBase, {
	mousedown : function(evt, element) {
		var xy = this.getXY(evt);
		console.log('mousedown: '+xy[0]+','+xy[1]);
		var color = '#'+Ext.getCmp('CanvasColor').palette.value;
		var size = 4;
		var sizeCmp = Ext.getCmp('CanvasDrawSizeGroup');
		if (sizeCmp != null && sizeCmp.getValue() != null) {
			switch (sizeCmp.getValue().value) {
				case '小': size = 2; break;
				case '中': size = 4; break;
				case '大': size = 8; break;
			}
		}
		this.context.beginPath();
		this.context.strokeStyle = color;
		this.context.fillStyle = color;
		this.context.arc(xy[0], xy[1], size, 0, 360, true);
		this.context.fill();
		this.context.closePath();
		sendFigure({
			type : 'point',
			color : color,
			size : size,
			paths : xy
		});
	}
});
var EraseRect = Ext.extend(DrawBase, {
	isErasing : false,
	isRectShow : false,
	eraceRect : null,
	pointList : null,
	size : null,
	begin : function() {
		var div = document.createElement('div');
		div.id = 'MyCanvasEraceRect';
		div.style.position = 'absolute';
		div.style.width = '30px';
		div.style.height = '30px';
		div.style.border = '1px dashed red';
		div.style.display = 'none';
		this.canvasTemporary.appendChild(div);
		this.eraceRect = div;
		this.pointList = [];
	},
	end : function() {
		EraseRect.superclass.end.apply(this, arguments);
		this.isErasing = false;
		this.eraceRect = null;
	},
	mousedown : function(evt, element) {
		this.isErasing = true;
		var xy = this.getXY(evt);
		this.pointList = [];
		this.pointList.push(xy);
		this.context.clearRect(xy[0]-(this.size/2), xy[1]-(this.size/2), this.size, this.size);
		evt.stopEvent();
	},
	mousemove : function(evt, element) {
		if (!this.isRectShow) {
			this.isRectShow = true;
			var size = 30;
			var sizeCmp = Ext.getCmp('CanvasDrawSizeGroup');
			if (sizeCmp != null && sizeCmp.getValue() != null) {
				switch (sizeCmp.getValue().value) {
					case '小': size = 10; break;
					case '中': size = 30; break;
					case '大': size = 60; break;
				}
			}
			this.size = size;
			this.eraceRect.style.width = this.size + 'px';
			this.eraceRect.style.height = this.size + 'px';
			this.eraceRect.style.display = '';
		}
		var xy = this.getXY(evt);
		this.eraceRect.style.left = (xy[0]-(this.size/2))+'px';
		this.eraceRect.style.top = (xy[1]-(this.size/2))+'px';
		if (this.isErasing) {
			this.pointList.push(xy);
			this.context.clearRect(xy[0]-(this.size/2), xy[1]-(this.size/2), this.size, this.size);
		}
	},
	mouseup : function(evt, element) {
		if (evt.type == 'mouseout') {
			this.isRectShow = false;
			this.eraceRect.style.display = 'none';
		}
		if (!this.isErasing) { return; }
		this.isErasing = false;
		if (this.pointList.length > 0) {
			console.log('mouseup: '+this.pointList);
			sendFigure({
				type : 'erase',
				size : this.size,
				points : [].concat(this.pointList)
			});
		}
	}
});

//TODO クラス内でDOMオブジェクト保持しているのをやめる（Canvasなど）

})(window);


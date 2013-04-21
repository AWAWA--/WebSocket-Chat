
(function(global) {

Ext.BLANK_IMAGE_URL = "extjs/resources/images/default/s.gif";

var socket = null;
var connected = false;
var config = {};
var configTmp = null;
var privateMsgLog = [];
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
	'fields': ['id', 'name', 'host', 'addr', 'loginDate', 'userAgent']
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
	if (myName != null && privateMsgLog.length > 0) {
		localStorage['privateMsgLog'] = JSON.stringify(privateMsgLog);
	}
	if (socket != null) {
		socket.disconnect();
		socket = null;
	}
});
Ext.onReady(function() {
	
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
		'notification_userAddDelTime' : 3.5
	});
	console.log('config : ' + JSON.stringify(config));
	
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
		listeners : {
			show : function(dialog) {
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
				activeTab: 0,
				enableTabScroll : true,
				defaults : {
					autoScroll : true,
					padding : 5
				},
				items: [{
					title: 'デスクトップ通知',
					layout : 'fit',
					height : 350,
					items : [{
						border : false,
						layout : 'vbox',
						align : 'left',
						padding: 10,
						items : [{
							xtype: 'label',
							margins: {top:3, right:0, bottom:15, left:0},
							text: '※デスクトップ通知はGoogleChromeのみ使用できます'
						},{
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
						}]
					}]
				}]
			})
		]
	});
	
	var toolBar = new Ext.Toolbar({
		autoHeight : true,
		items: [
			'-',
			{
				text : 'デスクトップ通知を許可',
				listeners : {
					click : function() {
						if (!global.webkitNotifications) {
							Ext.MessageBox.alert(
								'　',
								'お使いのブラウザはデスクトップ通知に対応していません。'
								+'<br />GoogleChromeの最新版をお使いください。'
							);
						} else if (global.webkitNotifications.checkPermission() != 0) {
							console.log('permission:'+global.webkitNotifications.checkPermission());
							global.webkitNotifications.requestPermission(function() {
								console.log('permission:'+global.webkitNotifications.checkPermission());
							});
						}
					}
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
							+'<br />・ブラウザはIE9でも動きますが、GoogleChrome最新版がお勧め'
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
			'-'
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
					icon : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQEAYAAABPYyMiAAAKPWlDQ1BpY2MAAHjanVNnVFPpFj333vRCS4iAlEtvUhUIIFJCi4BUaaISkgChhBgSQOyIqMCIoiKCFRkUccDREZCxIoqFQbH3AXkIKOPgKDZU3g/eGn2z5r03b/avvfY5Z53vnH0+AEZgsESahaoBZEoV8ogAHzw2Lh4ndwMKVCCBA4BAmC0LifSPAgDg+/Hw7IgAH/gCBODNbUAAAG7YBIbhOPx/UBfK5AoAJAwApovE2UIApBAAMnIVMgUAMgoA7KR0mQIAJQAAWx4bFw+AagEAO2WSTwMAdtIk9wIAtihTKgJAowBAJsoUiQDQDgBYl6MUiwCwYAAoypGIcwGwmwBgkqHMlABg7wCAnSkWZAMQGABgohALUwEI9gDAkEdF8AAIMwEojJSveNJXXCHOUwAA8LJki+WSlFQFbiG0xB1cXbl4oDg3Q6xQ2IQJhOkCuQjnZWXKBNLFAJMzAwCARnZEgA/O9+M5O7g6O9s42jp8taj/GvyLiI2L/5c/r8IBAQCE0/VF+7O8rBoA7hgAtvGLlrQdoGUNgNb9L5rJHgDVQoDmq1/Nw+H78fBUhULmZmeXm5trKxELbYWpX/X5nwl/AV/1s+X78fDf14P7ipMFygwFHhHggwuzMrKUcjxbJhCKcZs/HvHfLvzzd0yLECeL5WKpUIxHS8S5EmkKzsuSiiQKSZYUl0j/k4l/s+wPmLxrAGDVfgb2QltQu8oG7JcuILDogCXsAgDkd9+CqdEQBgAxBoOTdw8AMPmb/x1oGQCg2ZIUHACAFxGFC5XynMkYAQCACDRQBTZogz4YgwXYgCO4gDt4gR/MhlCIgjhYAEJIhUyQQy4shVVQBCWwEbZCFeyGWqiHRjgCLXACzsIFuALX4BY8gF4YgOcwCm9gHEEQMsJEWIg2YoCYItaII8JFZiF+SDASgcQhiUgKIkWUyFJkNVKClCNVyF6kHvkeOY6cRS4hPcg9pA8ZRn5DPqAYykDZqB5qhtqhXNQbDUKj0PloCroIzUcL0Q1oJVqDHkKb0bPoFfQW2os+R8cwwOgYBzPEbDAuxsNCsXgsGZNjy7FirAKrwRqxNqwTu4H1YiPYewKJwCLgBBuCOyGQMJcgJCwiLCeUEqoIBwjNhA7CDUIfYZTwmcgk6hKtiW5EPjGWmELMJRYRK4h1xGPE88RbxAHiGxKJxCGZk1xIgaQ4UhppCamUtJPURDpD6iH1k8bIZLI22ZrsQQ4lC8gKchF5O/kQ+TT5OnmA/I5CpxhQHCn+lHiKlFJAqaAcpJyiXKcMUsapalRTqhs1lCqiLqaWUWupbdSr1AHqOE2dZk7zoEXR0miraJW0Rtp52kPaKzqdbkR3pYfTJfSV9Er6YfpFeh/9PUODYcXgMRIYSsYGxn7GGcY9xismk2nG9GLGMxXMDcx65jnmY+Y7FZaKrQpfRaSyQqVapVnlusoLVaqqqaq36gLVfNUK1aOqV1VH1KhqZmo8NYHacrVqteNqd9TG1FnqDuqh6pnqpeoH1S+pD2mQNcw0/DREGoUa+zTOafSzMJYxi8cSslazalnnWQNsEtuczWensUvY37G72aOaGpozNKM18zSrNU9q9nIwjhmHz8nglHGOcG5zPkzRm+I9RTxl/ZTGKdenvNWaquWlJdYq1mrSuqX1QRvX9tNO196k3aL9SIegY6UTrpOrs0vnvM7IVPZU96nCqcVTj0y9r4vqWulG6C7R3afbpTump68XoCfT2653Tm9En6PvpZ+mv0X/lP6wActgloHEYIvBaYNnuCbujWfglXgHPmqoaxhoqDTca9htOG5kbjTXqMCoyeiRMc2Ya5xsvMW43XjUxMAkxGSpSYPJfVOqKdc01XSbaafpWzNzsxiztWYtZkPmWuZ883zzBvOHFkwLT4tFFjUWNy1JllzLdMudltesUCsnq1Sraqur1qi1s7XEeqd1zzTiNNdp0mk10+7YMGy8bXJsGmz6bDm2wbYFti22L+xM7OLtNtl12n22d7LPsK+1f+Cg4TDbocChzeE3RytHoWO1483pzOn+01dMb53+cob1DPGMXTPuOrGcQpzWOrU7fXJ2cZY7NzoPu5i4JLrscLnDZXPDuKXci65EVx/XFa4nXN+7Obsp3I64/epu457uftB9aKb5TPHM2pn9HkYeAo+9Hr2z8FmJs/bM6vU09BR41ng+8TL2EnnVeQ16W3qneR/yfuFj7yP3OebzlufGW8Y744v5BvgW+3b7afjN9avye+xv5J/i3+A/GuAUsCTgTCAxMChwU+Advh5fyK/nj852mb1sdkcQIygyqCroSbBVsDy4LQQNmR2yOeThHNM50jktoRDKD90c+ijMPGxR2I/hpPCw8OrwpxEOEUsjOiNZkQsjD0a+ifKJKot6MNdirnJue7RqdEJ0ffTbGN+Y8pjeWLvYZbFX4nTiJHGt8eT46Pi6+LF5fvO2zhtIcEooSrg933x+3vxLC3QWZCw4uVB1oWDh0URiYkziwcSPglBBjWAsiZ+0I2lUyBNuEz4XeYm2iIbFHuJy8WCyR3J58lCKR8rmlOFUz9SK1BEJT1IleZkWmLY77W16aPr+9ImMmIymTEpmYuZxqYY0XdqRpZ+Vl9Ujs5YVyXoXuS3aumhUHiSvy0ay52e3KtgKmaJLaaFco+zLmZVTnfMuNzr3aJ56njSva7HV4vWLB/P9879dQlgiXNK+1HDpqqV9y7yX7V2OLE9a3r7CeEXhioGVASsPrKKtSl/1U4F9QXnB69Uxq9sK9QpXFvavCVjTUKRSJC+6s9Z97e51hHWSdd3rp6/fvv5zsaj4col9SUXJx1Jh6eVvHL6p/GZiQ/KG7jLnsl0bSRulG29v8tx0oFy9PL+8f3PI5uYt+JbiLa+3Ltx6qWJGxe5ttG3Kbb2VwZWt2022b9z+sSq16la1T3XTDt0d63e83SnaeX2X167G3Xq7S3Z/2CPZc3dvwN7mGrOain2kfTn7ntZG13Z+y/22vk6nrqTu037p/t4DEQc66l3q6w/qHixrQBuUDcOHEg5d+873u9ZGm8a9TZymksNwWHn42feJ398+EnSk/Sj3aOMPpj/sOMY6VtyMNC9uHm1JbeltjWvtOT77eHube9uxH21/3H/C8ET1Sc2TZadopwpPTZzOPz12RnZm5GzK2f72he0PzsWeu9kR3tF9Puj8xQv+F851eneevuhx8cQlt0vHL3Mvt1xxvtLc5dR17Cenn451O3c3X3W52nrN9Vpbz8yeU9c9r5+94Xvjwk3+zSu35tzquT339t07CXd674ruDt3LuPfyfs798QcrHxIfFj9Se1TxWPdxzc+WPzf1Ovee7PPt63oS+eRBv7D/+T+y//FxoPAp82nFoMFg/ZDj0Ilh/+Frz+Y9G3guez4+UvSL+i87Xli8+OFXr1+7RmNHB17KX078VvpK+9X+1zNet4+FjT1+k/lm/G3xO+13B95z33d+iPkwOJ77kfyx8pPlp7bPQZ8fTmROTPwTA5jz/CVjM6IAAAAgY0hSTQAAeiUAAICDAAD5/wAAgOkAAHUwAADqYAAAOpgAABdvkl/FRgAAAAZiS0dE////////CVj33AAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAl2cEFnAAAAEAAAABAAXMatwwAABZJJREFUSMflkmlQlHUcx7//fZ49WdhlWSgUgVUuwaNAwQ1TB0wSRUVR1vCGcSoP1KixyCvNRqdI88pGPHBQ0TQVtDw5PLBA8CIMEBaVww0Edln2WZ6rNzbZTE0507s+r37vfp/5fr/A/x3y+5H2xjeFAFCeUeMAsDfeN6pKMck7tY/BQ+JzN3qG4gdZvHJxoAgDvOCL19kULsFpatxt2dk5puXpjXmVr1UvsGkamz2+1SoBPivb9E7ffyXwgflQNlkEdHV2V4o75EFBhf0u+CkTbAFLvQcOPbQiy3uS1tWv8tU4lbf8sMsERROsEGCDBzO59ySzpje5Pbt7WevVemPttJabFaP2xFVLzH1rrnw9VhOpblRMsIsbI0yezJm/F6Bj1HHOgCFAWV7xY2vwWGrgCp/AYY27EvxFT6l/u95EppLTjiRAXCrGtl+Gu2gDCxvgEicfQcfJStRuiql9boeAypO049baHPzY8DlzJECtt14ZqZpy0W/HvmmGRyXX7pRcPV1mH9e6P6wusgHAgtXF14YDABmXl7EIcNVPmRSXPLRuz8Eoj6CQ4ekz3pSep53CdECUY474BQAvuGDKs9IIgKdwoBgg2VhBKgD2Q+EeyQQerLqXac5Fhf8Fi6H/OsbgaGoLaj9aee7h4tpzd2KyVpgjaiLrFua7ug5226soctbQLptVRjJPf0Bmp4vlieFrxFKSwZ7Hm+wIvkwMBcRO0QHNs7xynsvupWcdZhMV1ICYiWMkGGBbpBLmHMJJKuK76xTo+1a/RN9Io4kKl8whBbsKHWd7NjtqHUXG64E7NfVnQNvPWbdJ9+Bgj4fjEH+L9XH0761mREA4IA4W1gPYiRmwAyAgf0z2OdZjIqwAySBtxAgw6U6NYALYfKa/IxoQlsP0NAdw/1Kb6WrR79Y+1M3Wb55jz/I5ZrwdVxJFyc9LQz1msr+4t/u0kNQ+Xbp3dXfV3ZFl0kCZhPqISmJFfgcXAXBVQh++CeBahWD+CcDphQl8LyBkixnCfIDJ4NL4NKDj09pS6yrAJ4Bd7PYYkN7EcbwPkMMwCMFAp7ljR8cUxfhHLzd3WwpPNNJVlSXnLQPtbHTYzINkQc4p+ULlmcaE2OXRp8JPGbhwUGnUCUkiQPdQOkk8AE+yQbwDCNHCSugAZiC7WIwFmpbUbGgLA9yPt6roVIDeqfqE7QJ6k3mRHQyQq1SsJB5grjir2bzer21zex/QY8T7NCGEAERnWrZxPUk15rgluQ5T6QOVNZaGuvbV1hBLsGWyo8vc6e7vmq7g/ZKV9+irVIBmK1/fc5hzAfgzbdsYGeCt6M6WTgR8W5TBbuWAkMRvd54FkCseo+YAHUesWc617Pz6pOaTXfsLQu/ztnTNdst3FAAMjcEJgyliiKOMCumY3BnFbOvg7g+vklk35OaVNVwaxFh3NbV5lZe2DqnL8JpqobkFYZMDZouzXEZo5wVcJ1K1BvAZ5ZKvehuQHZWulsgB4bI4UlQDrJq7yY0CymV3Fz16/3Z9cczPfrZL65ILl1QX/VrQ9B4dNS9spPwJ9hXlbr0ZMao802Zxbu0SKr0UgYCMF2PZi0DKRt4ouzHAKyvuAWsOZce3X2z5SSLY3S2NKTO8AjxeURUMKlK9p1hD57sv4h8LWaKZvdKR0MUxY35Ve83SzpUnGLo1m9QrZQ2BmtB+HrVsmrGZvEEIblXp/mrXf0KHiC2J3YDQrFX6bEE4U/rQtyqaHhY4C1nmAt0mrV5SYh/wcggdicH8DRdOzBdLyUlupXMZGS3bzhQFNeu07FfhdbpXleNEzYDpPR8zG7lV+aN3OyovhPQt4/5R4EWhiiIq0qIA6q48SPIV0nvPPkppLaBu43t7IutJJihz3VdqKvjY4I/0Wx4sEz/7r/+/ML8BVktvhYhqX2oAAAAASUVORK5CYII=',
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
   				{header: 'Name', dataIndex: 'name',
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
			}
		},
		items:[{
			id : 'MainTab',
			title	: '共有タイムライン',
			layout : 'border',
			closable : false,
			items : 
			[{
				id : 'MainView',
				region:'center',
				autoScroll : true,
				bodyStyle : {
					backgroundColor : 'transparent !important'
					//backgroundColor : '#4E79B2 !important'
				},
				//layout : 'vbox',
				items : [
				]
			}, {
				region:'north',
				border : false,
				//autoHeight : true,
				layout : 'border',
				bodyStyle : {
					height : '1.5em'
				},
				padding : 3,
				items : 
				[{
					region : 'center',
					layout : 'border',
					border : false,
					items : [
	 					new Ext.form.TextArea({
	 						id : 'MainMsg',
	 						region : 'center',
	 						enableKeyEvents : true,
	 						// grow : true,
	 						// preventScrollbars : true,
	 						style : {
								fontSize : '1.2em'
	 						},
	 						listeners : {
	 							render : function(textField) {
	 								var dom = textField.getEl().dom;
									var reader = new FileReader();
									var img = document.getElementById('dummyImage');

									img.onload = function() {
										try {
											// img.onload = Ext.emptyFn;
											var imageWidth = img.width;
											var imageHeight = img.height;
											// console.log(imageWidth + ' : ' + imageHeight);
											if (imageWidth == 1 && imageHeight == 1) { return; }
											var scale = (function() {
												var MAX_PIXEL = 1024;
												if (imageWidth <= MAX_PIXEL && imageHeight <= MAX_PIXEL) { return 1; }
												return MAX_PIXEL / Math.max(imageWidth, imageHeight);
											})();
											// console.log('scale = ' + scale);
											var canvas = document.getElementById('MainImage');
											canvas.width = Math.ceil(img.width * scale);
											canvas.height = Math.ceil(img.height * scale);
											var ctx = canvas.getContext('2d');
											// console.log(ctx);
											ctx.save();
											ctx.scale(scale, scale);
											ctx.drawImage(img, 0, 0);
											ctx.restore();
											Ext.getCmp('MainImgIcon').enable();
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

	 								dom.onpaste = function(event) {
										try {
		 									// console.log(event.clipboardData);
		 									// console.log(event.clipboardData.items);
											var dataItem = event.clipboardData.items[0];
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
	 								};
	 							},
	 							keydown : function(textField, event) {
	 								if (event.getKey() == 13) {
	 									var b = Ext.getCmp('sendButton');
	 									b.fireEvent('click', b, event);
	 									event.stopEvent();
	 									return false;
	 								}
	 							}
	 						}
						}),
						{
							id : 'MainImgIcon',
							region : 'east',
							// autoWidth : true,
							xtype : 'button',
							disabled : true,
							text : '画像なし',
							listeners: {
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
											html : '<img id="dummyImage" style="position:absolute;visibility:hidden;" />' +
												'<canvas id="MainImage" style="border:1px solid silver;" />'
										}
										],
										listeners : {
											beforeshow : function(win) {
												var canvas = document.getElementById('MainImage');
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
													Ext.getCmp('MainImgIcon').disable();
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
						}
					]
				},
				new Ext.Button({
					id : 'sendButton',
					region : 'east',
					autoWidth : true,
					style : {
						width : '8em !important'
					},
					text : '　送信　',
					listeners : {
						click : function(button, event) {
							var text = Ext.getCmp('MainMsg');
							var msg = text.getValue();
							if (msg != null && msg.length > 0) {
								sendMessage({
										msgTarget : null,
										isReply : false,
										effect : event.shiftKey ? 1 : event.altKey ? 2 : 0,
										msg : msg
									}, 
									(Ext.getCmp('MainImgIcon').disabled ? null : (function() {
										var canvas = document.getElementById('MainImage');
										return {
											imageWidth : canvas.width,
											imageHeight : canvas.height,
											imageData : canvas.toDataURL('image/png')
										};
									})())
								);
								Ext.getCmp('MainImgIcon').disable();
								setTimeout(function(){ text.reset(); }, 0);
							}
							text.focus();
						}	
					}
				})
				]
			}]
		},{
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
			items : [{
				id : 'PrivateMsgLogView',
				title : 'プライベートメッセージの過去ログ（読み取り専用）',
				region:'center',
				autoScroll : true,
				bodyStyle : {
					backgroundColor : 'transparent !important'
				},
				items : [
				]
			}]
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
	
	showInitDialog();
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

			if (
				global.webkitNotifications &&
				global.webkitNotifications.checkPermission() != 0
			) {
				Ext.MessageBox.show({
			 	   title:'情報',
			 	   msg: '通知機能が有効になっていません。<br />デスクトップ通知を許可してください。',
			 	   buttons: Ext.Msg.OK,
			 	   closable : false,
			 	   fn: function(button, text) {
						console.log('permission:'+global.webkitNotifications.checkPermission());
						global.webkitNotifications.requestPermission(function() {
							console.log('permission:'+global.webkitNotifications.checkPermission());
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
					retryCount = 0;
				}
				join();
			},
			failure: function(response, opts) {
				if (messageBox == null || !messageBox.isVisible()) {
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

	var path = global.location.protocol+'//'+global.location.host+'/';
	console.log('path: '+path);
	socket = io.connect(path, {
		'reconnect': true
		// ,'reconnection delay' : 100
		// ,'reconnection limit' : 60 * 1000
		// ,'max reconnection attempts': 3
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
		Ext.getCmp('MainView').removeAll(true);
		//共有お絵かきのリセット
		handleFigure({type : 'clear'})
		//参加者一覧のリセット
		userStore.removeAll();

		//参加者一覧のロード
		userStore.loadData(data);
		//共有メッセージのロード
		var msgTab = Ext.getCmp('MainView');
		var msgList = data.msgList;
		for (var i=0,l=msgList.length;i<l;i++) {
			msgAdd(msgTab, msgList[i]);
		}
		//共有お絵かきのロード
		var figureList = data.figureList;
		for (var i=0,l=figureList.length; i<l; i++) {
			handleFigure(figureList[i]);
		}

		//プライベートメッセージ読み込み
		if (localStorage['privateMsgLog']) {
			try {
				var objStr = localStorage['privateMsgLog'];
				var obj = JSON.parse(objStr);
				if (obj instanceof Array) {
					privateMsgLog = obj;
					// console.log(objStr);
				}
			} catch (e) { console.log(e); }
		}
		var msgPanel = Ext.getCmp('PrivateMsgLogView');
		for (var i=0,l=privateMsgLog.length; i<l; i++) {
			msgAdd(msgPanel, privateMsgLog[i]);
		}

		Ext.getCmp('MainMsg').focus();
	});
	socket.on('user add', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var readResult = userStore.reader.readRecords(data);
		for (var i=0,l=readResult.records.length; i<l; i++) {
			userStore.addSorted(readResult.records[i]);
		}
		if (!data.reconnect && config.notification_userAddDel) {
			showDesktopPopup(
				'ユーザ参加',
				'「' + data.users.name + '」 が参加しました。',
				config.notification_userAddDelTime
			);
		}
	});
	socket.on('user delete', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var record = userStore.query('id', data.users.id);
		if (record != null && record.length > 0) {
			userStore.remove(record.get(0));
		}
		if (config.notification_userAddDel) {
			showDesktopPopup(
				'ユーザ退室',
				'「' + data.users.name + '」 が退室しました。',
				config.notification_userAddDelTime
			);
		}
	});
	socket.on('message push', function(encryptedData, noEncryptedData, callbackFn) {
		var data = common.decryptByAES(encryptedData, commonKey);
		//console.log('callbackFn: '+fn);
		handleMessage(data, noEncryptedData, callbackFn);
	});
	socket.on('message delete', function(str) {
		var data = common.decryptByAES(str, commonKey);
		var targetPanel = Ext.getCmp('MainView');
		var targetItems = targetPanel.items;
		var removeList = [];
		// console.log(data);
		for (var i=0,l=targetItems.length; i<l; i++) {
			var targetItem = targetItems.get(i);
			// console.log(targetItem.initialConfig.data);
			var equals = true;
			for (var prop in data) {
				if (data[prop] != targetItem.initialConfig.data[prop]) {
					equals = false;
					break;
				}
			}
			if (equals) { removeList.push(targetItem); }
		}
		for (var i=0,l=removeList.length; i<l; i++) {
			targetPanel.remove(removeList[i], true);
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

function handleMessage(data, noEncryptedData, callbackFn) {
	var tabID;
	var msgPanel;
	if (data.isPrivate) {
		var openID = 
			(data.msgTarget == myID) ? data.id : data.msgTarget;
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
	msgAdd(msgPanel, data, noEncryptedData);
	if (data.id != myID) {
		if (data.isPrivate && callbackFn != null) {
			callbackFn('private message catched.');
		}
		if (
			(data.isPrivate && config.notification_privateMsg) ||
			(!data.isPrivate && config.notification_publicMsg)
		) {
			showDesktopPopup(
				data.name + ' からの' + (data.isPrivate ? 'プライベート' : '') + 'メッセージ',
				data.msg,
				(data.isPrivate ?
					config.notification_privateMsgTime : 
					config.notification_publicMsgTime),
				tabID
			);
		}
	}
	if (data.isPrivate) {
		msgAdd(Ext.getCmp('PrivateMsgLogView'), data);
		var LOG_LIMIT = 100;
		if (privateMsgLog.length >= LOG_LIMIT) {
			var delCount = privateMsgLog.length - LOG_LIMIT + 1;
			var tmpArray = [];
			for (var i=0,l=privateMsgLog.length; i<l; i++) {
				var oldData = privateMsgLog[i];
				if (oldData.favorite || delCount == 0) {
					tmpArray.push(oldData);
					continue;
				}
				delCount--;
			}
			privateMsgLog = tmpArray;
		}
		privateMsgLog.push(data);
		if (privateMsgLog.length > LOG_LIMIT) {
			Ext.MessageBox.alert('警告',
				'過去ログの最大保存数をオーバーしています。不要なお気に入りを解除してください。<br/>'
				+ '最大保存数：'+LOG_LIMIT+' 現在の保存対象ログ数:'+privateMsgLog.length);
		}
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
	return function(targetPanel, data, noEncryptedData) {
		var msgPanel = new Ext.Panel({
			autoWidth : true,
			autoHeight : true,
			// height : 150,
			bodyStyle : {
				height : '2em'
			},
			padding : 5,
			// layout : 'table',
			// layoutConfig : {
			// 	columns : 1
			// },
			data : data,
			items : 
			[{
				autoWidth : true,
				autoHeight : true,
				// height : 50,
				layout : 'hbox',
				// layoutConfig : {
				// 	align : 'stretch'
				// },
				border : false,
				bodyStyle : {
					height : '1em'
				},
				defaults:{
					border : false,
					bodyStyle : {
						marginRight : '10px',
						whiteSpace: 'nowrap',
						color : 'silver',
						fontSize : 'small'
					}
				},
				items :
				(function() {
					var items = [];
					items.push({
						html : Ext.util.Format.htmlEncode(data.name) 
					});
					items.push({
						html : 
							Ext.util.Format.htmlEncode(data.host) 
							+ '('
							+ Ext.util.Format.htmlEncode(data.addr)
							+ ')'
					});
					items.push({
						xtype:'spacer',
						flex:1
					});
					items.push({
						html : Ext.util.Format.htmlEncode(
							Ext.util.Format.date(new Date(data.time),'Y/m/d H:i:s')
						)
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
					if (targetPanel.getId() == 'PrivateMsgLogView') {
						items.push({
							xtype : 'button',
							text : !!data.favorite ? 'お気に入り解除' : 'お気に入り追加',
							enableToggle : true,
							pressed : !!data.favorite,
							toggleHandler : function(button, pushed) {
								if (pushed) {
									data.favorite = true;
									button.setText('お気に入り解除');
								} else {
									data.favorite = false;
									button.setText('お気に入り追加');
								}
							}
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
					items.push({
						// height : 50,
						autoHeight : true,
						// autoWidth : true,
						columnWidth　: .99,
						border : false,
						bodyStyle : {
							height : '1em;',
							wordBreak : 'break-all',
							fontFamily : 'monospace'	//等幅フォント
						},
						html : (function() {
							var str = Ext.util.Format.htmlEncode(''+data.msg);
							// console.log(JSON.stringify(str));
							str = str.replace(
								/(https?:\/\/[a-zA-Z0-9\-_.!?~*;:\/\@&=+\$,%#]+)/g,
								'<a target="_blank" href="$1">$1</a>');
							str = str.replace(
								/\t/g,
								'&nbsp;&nbsp;&nbsp;&nbsp;');
							str = str.replace(
								/\r\n|\n/g,
								'<br />');
							switch(data.effect) {
								case 1:
									str = '<div style="'+
										'transform-origin:left top;-webkit-transform-origin:left top;-moz-transform-origin:left top;-ms-transform-origin:left top;-o-transform-origin:left top;'+
										'transform:scale(0.6,0.6);-webkit-transform:scale(0.6,0.6);-moz-transform:scale(0.6,0.6);-ms-transform:scale(0.6,0.6);-o-transform:scale(0.6,0.6);'+
										'">'+str+'</div>';
									break;
								case 2:
									str = '<div style="font-size:2em;">'+str+'</div>';
									break;
								default:
									break;
							}
							return str;
						})()
					});
					if (noEncryptedData != null && noEncryptedData.imageData != null) {
						var width = Math.min(noEncryptedData.imageWidth, 128);
						items.push({
							border : true,
							width : width,
							html : '<img style="max-width:'+width+'px;cursor:pointer;"' +
								' src="'+noEncryptedData.imageData+'" />',
							listeners : {
								render : function(panel) {
									panel.body.on('click', function() {
										imageDef = noEncryptedData;
										imageViewWin.show();
									});
								}
							}
						});
					}
					return items;
				})()
			}]
		});
		msgPanel.doLayout();
		//_msgPanel = msgPanel;
		if (targetPanel.items.length > 100) {
			targetPanel.remove(targetPanel.items.get(targetPanel.items.length-1), true);
		}
		targetPanel.insert(0, msgPanel);
		targetPanel.doLayout();
	};
})();

function showDesktopPopup(title, msg, showTime, focusTabID) {
	if (
		global.webkitNotifications &&
		global.webkitNotifications.checkPermission() == 0
	) {
		var notifyMsg = (msg.length > 36) ? (msg.substring(0,35)+'...') : (msg);
		var notify = global.webkitNotifications.createNotification(
			'./extjs/resources/images/default/window/icon-info.gif',
			title,
			notifyMsg
		);
		notify.onclick = function() { 
			notify.cancel();
			if (focusTabID != null) {
				var tabPanel = Ext.getCmp('tabPanel');
				tabPanel.setActiveTab(focusTabID);
			}
			alert(notifyMsg);
		}
		if (showTime > 0) {
			notify.ondisplay = function() {
				setTimeout(function() { notify.cancel(); }, 
					showTime * 1000
				);
			};
		}
		notify.show();
	}
}

function addPrivateTab(user) {
	var tabPanel = Ext.getCmp('tabPanel');
	var escapedUserID = Ext.util.Format.htmlEncode(user.id);
	var escapedUserName = Ext.util.Format.htmlEncode(user.name);
	var escapedHost = Ext.util.Format.htmlEncode(user.host);
	var escapedAddr = Ext.util.Format.htmlEncode(user.addr);
	if (Ext.getCmp('PrivateTab_' + escapedUserID) == null) {
		console.log('open new tab : ' + JSON.stringify(user));
		tabPanel.add({
			id : 'PrivateTab_' + escapedUserID,
			title	: 'w/ ' + escapedUserName,
			layout : 'fit',
			closable : true,
			items : 
			[{
				title : escapedUserName + ' : ' + escapedHost + '(' + escapedAddr + ')' + ' とのプライベート板',
				layout : 'border',
				items : [
					{
						id : 'PrivateView_' + escapedUserID,
						region:'center',
						autoScroll : true,
						bodyStyle : {
							backgroundColor : 'transparent !important'
						},
						items : [
						]
					}, {
						region:'north',
						//autoHeight : true,
						layout : 'border',
						bodyStyle : {
							height : '1.5em'
						},
						padding : 3,
						items : 
						[{
							region : 'center',
							layout : 'fit',
							items : [
								new Ext.form.TextArea({
									id : 'PrivateMsg_' + escapedUserID,
									enableKeyEvents : true,
			 						grow : true,
			 						preventScrollbars : true,
			 						style : {
										fontSize : '1.2em'
			 						},
									listeners : {
										keydown : function(textField, event) {
											if (event.getKey() == 13) {
												Ext.getCmp('PrivateSend_' + escapedUserID).fireEvent('click');
												event.stopEvent();
												return false;
											}
										}
									}
								})
							]
						},
						new Ext.Button({
							id : 'PrivateSend_' + escapedUserID,
							region : 'east',
							//autoWidth : true,
							style : {
								width : '8em !important'
							},
							text : '　送信　',
							listeners : {
								click : function() {
									var text = Ext.getCmp('PrivateMsg_' + escapedUserID);
									var msg = text.getValue();
									if (msg != null && msg.length > 0) {
										sendMessage({
											msgTarget : user.id,
											isReply : false,
											msg : msg
										});
										setTimeout(function(){ text.reset(); }, 0);
									}
									text.focus();
								}
							}
						})
						]
					}
				]
			}]
		});
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


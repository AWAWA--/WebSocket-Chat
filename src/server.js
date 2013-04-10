var express = require('express')
  , app = express()
  , dns = require('dns')
  , fs = require('fs')
  , os = require('os')
  , path = require('path')
  , util = require('util')
  , JaySchema = require('jayschema');

util.log('argv: ' + process.argv);

//設定情報スクリプトのロード
var APP_CONFIG = eval('(function() {' +
	fs.readFileSync(path.join(__dirname, 'config.js')) +
	'; return APP_CONFIG;})()'
);
util.log('APP_CONFIG: ' + JSON.stringify(APP_CONFIG));

//サーバ・クライアント共通スクリプトのロード
var common = eval('(function() {' +
	'var APP_CONFIG = ' + JSON.stringify(APP_CONFIG) + ';' +
	fs.readFileSync(path.join(__dirname, 'common.js')) +
	'; return common;})()'
);


var port = process.argv[2] || APP_CONFIG.PORT;
util.log('port: ' + port);

var server;
if (port == 443) {
	var https = require('https');
	server = https.createServer({
			key: fs.readFileSync('ssl/privatekey.pem'),
			cert: fs.readFileSync('ssl/certificate.pem')
		}, app);
} else {
	var http = require('http');
	server = http.createServer(app);
}

var io = require('socket.io').listen(server);
io.set('log level', 1);

//認証設定
if (APP_CONFIG.BASIC_AUTH) {
	var userPass = eval('('+fs.readFileSync(
		path.join(__dirname, APP_CONFIG.BASIC_AUTH_FILE))+')');
	app.use(express.basicAuth(function(user, password) {
		return userPass[user] != null && userPass[user] == password;
	}));
}

app.get('/command/ping', function(req, res) {
	res.send('OK');
});
app.get('/command/shutdown', function(req, res) {
	if (req.connection.remoteAddress != '127.0.0.1') {
		res.send('NG');
		return;
	}
	res.send('OK');
	process.exit();
});

app.get('/ws_chat.manifest', (function() {
	var manifestData = '';
	var lastUpdateTime = 0;
	var reg = /^(.+)\.manifest$/;
	var eol = os.EOL;
	function write(str) {
		manifestData += str;
	}
	function writeCacheEntry(dir) {
		var rootPath = path.join(__dirname, dir);
		var files = fs.readdirSync(rootPath);
		for (var i=0,l=files.length; i<l; i++) {
			var fileName = files[i];
			if (reg.test(fileName)) { continue; }
			var stats = fs.statSync(path.join(rootPath, fileName));
			if (stats.isDirectory()) {
				writeCacheEntry(dir + '/' + fileName);
				continue;
			}
			// util.log(JSON.stringify(stats));
			write(dir+'/'+fileName + eol);
			var mTime = stats.mtime.getTime();
			if (mTime > lastUpdateTime) {
				lastUpdateTime = mTime;
			}
		}
	}
	write('CACHE MANIFEST' + eol);
	write('CACHE:' + eol);
	writeCacheEntry('.');
	write('./socket.io/socket.io.js' + eol);
	write(eol);
	write('NETWORK:' + eol);
	write('*' + eol);
	write(eol);
	return function(req, res) {
		// util.log(JSON.stringify(req.headers));
		var ifModifiedSince = req.headers['if-modified-since'];
		var lastUpdateGMTString = new Date(lastUpdateTime).toGMTString();
		util.log('ifModifiedSince:'+ifModifiedSince+' lastUpdateGMTString:'+lastUpdateGMTString);
		if (ifModifiedSince != null && ifModifiedSince == lastUpdateGMTString) {
			res.statusCode = 304;
			res.end();
			return;
		}
		res.writeHead(200, {
			'Content-Type': 'text/cache-manifest',
			'Last-Modified' : lastUpdateGMTString
		});
		res.write(manifestData);
		res.write('#' + lastUpdateGMTString + eol);
		res.end();
	};
})());

app.configure(function() {
	var rootPath = __dirname;
	util.log('rootPath: '+rootPath);
	app.use(express.static(rootPath));
});


var clientMap = {};


//データキューの生成（過去ログとして使用）
var Queue = function(queueSize) {
	if (!!queueSize) { this.size = queueSize; }
	this.queue = [];
}
Queue.prototype = {
	size : 10,
	queue : null,
	add : function(item) {
		this.queue.push(item);
		while (this.queue.length > this.size) {
			this.queue.shift();
			//util.log('queue delete. size='+this.queue.length);
		}
	},
	delete : function(item) {
		var newQueue = this.queue.filter(function(queueItem) {
			for (var i in item) {
				if (item[i] != queueItem[i]) {
					return true;
				}
			}
			return false;
		});
		// util.log('queue delete: '+this.queue.length+' -> '+newQueue.length);
		this.queue = newQueue;
	},
	getAll : function() {
		return [].concat(this.queue);
	}
};
var msgQueue = new Queue(35);
var figureQueue = new Queue(35);


//ログデータの読み込み
var dataLogFile = './dataLog_'+port+'.txt';
(function() {
	if (fs.existsSync(dataLogFile)) {
		var dataStr = fs.readFileSync(dataLogFile, 'utf8');
		if (dataStr == null || dataStr == '') { return; }
		var data = JSON.parse(dataStr);
		if (data.msgQueue) {
			for (var i=0,l=data.msgQueue.length; i<l; i++) {
				msgQueue.add(data.msgQueue[i]);
			}
			util.log('msgQueue loaded. datasize='+data.msgQueue.length);
		}
		if (data.figureQueue) {
			for (var i=0,l=data.figureQueue.length; i<l; i++) {
				figureQueue.add(data.figureQueue[i]);
			}
			util.log('figureQueue loaded. datasize='+data.figureQueue.length);
		}
	}
})()


//ホスト名を取得するための関数を定義
var getHostByAddr = (function() {
	var getHostByAddrJS = path.dirname(__filename) + '/getHostByAddr.js';
	if (fs.existsSync(getHostByAddrJS)) {
		var myModule = require(getHostByAddrJS);
		return myModule.getHostByAddr;
	} else {
		return function(address, defaultHostName, callback) {
			dns.reverse(address, function(err, host) {
				if (err) {
					util.log('DNS reverse failed: address='+address+' err='+JSON.stringify(err));
					callback(defaultHostName);
					return;
				}
				if (host == null || host == '') {
					callback(defaultHostName);
				} else {
					if (host.length == 1) {
						callback(host[0]);
					} else {
						callback(host.toString());
					}
				}
			});
		};
	}
})();


//暗号化セットアップ
var cryptico;
var rsa;
var publicKeyString;
if (APP_CONFIG.ENCRYPTION) {
	cryptico = eval('(function() {' +
		'var navigator = {};' +
		'var alert = function(msg){ util.log(msg); };' +
		fs.readFileSync(path.join(__dirname, 'cryptico/cryptico.js')) +
		'; return cryptico;})()'
	);
	rsa = cryptico.generateRSAKey(''+new Date().getTime(), 1024);
	// util.log(rsa);
	publicKeyString = cryptico.publicKeyString(rsa);
	// util.log(JSON.stringify(publicKeyString));
}


//JSONのバリデート関数
var jsonValidate = (function() {
	//JSONスキーマのロード
	var jsonSchema = new JaySchema();
	var rootPath = path.join(__dirname, 'json_schema');
	var files = fs.readdirSync(rootPath);
	var reg = /^(.+)\.json$/;
	for (var i=0,l=files.length; i<l; i++) {
		var fileName = files[i];
		if (!reg.test(fileName)) { continue; }
		jsonSchema.register(
			eval('('+fs.readFileSync(path.join(rootPath, fileName))+')'),
			fileName.match(reg)[1]  //.jsonを除くファイル名をIDとして登録
		);
	}
	return function(socket, id, instance) {
		var validateResult = jsonSchema.validate(instance, id);
		if (validateResult.length == 0) {
			// util.log('validation ok: address='+socket.handshake.address.address+' id='+id);
			return true;
		} else {
			util.log('validation error: address='+socket.handshake.address.address+' schema='+id+' result='+JSON.stringify(validateResult));
			// util.log(JSON.stringify(instance));
			return false;
		}
	};
})();


server.listen(port);

io.sockets.on('connection', function (socket) {

	function emit(targetSocket, name, data, callback) {
		var client = clientMap[targetSocket.id];
		// util.log('emit '+name+': ' + JSON.stringify(client));
		targetSocket.emit(name, common.encryptByAES(data, client.commonKey), callback);
	}
	function broadcastEmit(thisSocket, name, data) {
		for (var clientID in clientMap) {
			// util.log('socket.id:'+socket.id +' clientID:'+clientID);
			if (thisSocket.id == clientID) { continue; }
			var client = clientMap[clientID];
			var targetSocket = io.sockets.socket(clientID);
			if (targetSocket) {
				// util.log('broadcast '+name+': ' + JSON.stringify(client));
				targetSocket.emit(name, common.encryptByAES(data, client.commonKey));
			}
		}
	}

	socket.on('handshake call', function(data) {
		// util.log('handshake call: ' + JSON.stringify(data));
		socket.emit('handshake reply', {
			publicKey : publicKeyString
		});
	});

	socket.on('chat start', function(data) {
		// util.log('chat start: ' + JSON.stringify(data));
		if (!jsonValidate(socket, 'chat_start', data)) { return; }

		var commonKey;
		if (APP_CONFIG.ENCRYPTION) {
			var decryptResult = cryptico.decrypt(data.encryptedCommonKey, rsa);
			commonKey = decryptResult.plaintext;
			// util.log('commonKey: ' + commonKey);
		}

		var address = socket.handshake.address.address;
		getHostByAddr(address, '****', function(hostName) {
			//util.log('chat start: ' + JSON.stringify(data));
			var userName = '' + data.name;
			if (userName.length > 100) {
				userName = userName.substring(0, 100) + '...';
			}
			var userAgent = '' + socket.handshake.headers['user-agent'];
			if (userAgent.length > 256) {
				userAgent = userAgent.substring(0, 256) + '...';
			}

			if (APP_CONFIG.BASIC_AUTH) {
				hostName = (function(authHeader) {
					try {
						var base64 = authHeader.substring('Basic '.length);
						var userPass = new Buffer(base64, 'base64').toString('utf8');
						var userID = userPass.split(':')[0];
						if (userID.length > 32) {
							userID = userID.substring(0, 32) + '...';
						}
						return userID;
					} catch (e) {
						util.log('error: address='+socket.handshake.address.address+', '+e);
						return 'null';
					}
				})(socket.handshake.headers['authorization']) + '@' + hostName;
			}

			var userData = {
				id : socket.id,
				name : userName,
				host : hostName,
				addr : address,
				loginDate : new Date().getTime(),
				userAgent : userAgent
			};
			util.log('<+> add connection: '+JSON.stringify(userData));

			clientMap[socket.id] = {
				userData : userData,
				commonKey : commonKey
			};

			emit(socket, 'chat setup', {
				myData : userData,
				users : (function() {
					var userList = [];
					for (var i in clientMap) {
						userList.push(clientMap[i].userData);
					}
					return userList;
				})(),
				msgList : msgQueue.getAll(),
				figureList : figureQueue.getAll()
			});

			var reconnect = false;
			if (data.reconnect) { reconnect = true; }
			broadcastEmit(socket, 'user add', {'users' : userData, 'reconnect' : reconnect });

			socket.on('message send', function(str) {
				var data = common.decryptByAES(str, commonKey);
				if (!jsonValidate(socket, 'message_send', data)) { return; }
				var  msgTarget = data.msgTarget;
				var isReply = data.isReply;
				var msg = '' + data.msg;
				if (msg.length > 2048) {
					msg = msg.substring(0, 2048) + ' ...';
				}

				var client = clientMap[socket.id];
				if (client == null) { return; }
				var userData = client.userData;

				var sendMsg = {
					'msgTarget' : msgTarget,
					'isPrivate' : (msgTarget != null && '' != msgTarget),
					'time' : new Date().getTime(),
					'id' : userData.id,
					'name' : userData.name,
					'host' : userData.host,
					'addr' : userData.addr,
					'effect' : data.effect,
					'msg' : msg
				};

				emit(socket, 'message push', sendMsg);
				if (sendMsg.isPrivate) {
					var targetSocket = io.sockets.socket(msgTarget);
					if (clientMap[msgTarget] != null && targetSocket != null) {
						var callbackCatched = false;
						emit(targetSocket, 'message push',
							sendMsg,
							function(callbackData) {
								callbackCatched = true;
							}
						);
						setTimeout(function() {
							//util.log('callbackCatched:'+callbackCatched);
							if (!callbackCatched) {
								emit(socket, 'error push', {
									errorID : 'PRIVATEMSG_CALLBACK_UNCATCHED'
								});
							}
						}, 10*1000);
					} else {
						emit(socket, 'error push', {
							errorID : 'PRIVATEMSG_TARGET_NOT_EXIST'
						});
					}
				} else {
					broadcastEmit(socket, 'message push', sendMsg);
					msgQueue.add(sendMsg);
				}
			});

			socket.on('figure send', function(str) {
				var data = common.decryptByAES(str, commonKey);
				if (!jsonValidate(socket, 'figure_send', data)) { return; }
				broadcastEmit(socket, 'figure push', data);
				figureQueue.add(data);
			});

			socket.on('message delete', function(str) {
				var data = common.decryptByAES(str, commonKey);
				if (!jsonValidate(socket, 'message_delete', data)) { return; }
				var client = clientMap[socket.id];
				if (client == null) { return; }
				var sendData = {
					"id": socket.id,
					"time": data.time
				};
				emit(socket, 'message delete', sendData);
				broadcastEmit(socket, 'message delete', sendData);
				msgQueue.delete(sendData);
			});
		});
	});

	socket.on('disconnect', function(event) {
		//util.log(JSON.stringify(arguments));
		var client = clientMap[socket.id];
		if (client) {
			util.log('<-> del connection: '+JSON.stringify(client.userData));
			delete clientMap[socket.id];
			//if (event == 'booted') {
				broadcastEmit(socket, 'user delete', {'users' : client.userData});
			//}
		}
	});

});

function writeDataLog(log) {
	fs.writeFileSync(dataLogFile, JSON.stringify({
		'msgQueue' : msgQueue.getAll(),
		'figureQueue' : figureQueue.getAll()
	}, null, '\t'), 'utf8');
	var path = fs.realpathSync(dataLogFile);
	if (log) {
		util.log('write data: ' + path);
	}
}

var writeDataLogTimer = setInterval(writeDataLog, 5*60*1000);

process.on('exit', function() {
	clearInterval(writeDataLogTimer);
	writeDataLog(true);
	util.log('process exit.');
});

util.log('server started. enter "exit" to shutdown...');

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', function (data) {
	var str = data.trim();
	switch (str) {
		case 'exit':
			io.sockets.clients().forEach(function(client) {
				client.disconnect();
			});
		case 'quit':
			// io.server.close(function() {
				process.exit();
			// });
			break;
		default:
			break;
	}
});

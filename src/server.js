var express = require('express')
  , app = express()
  , fs = require('fs')
  , util = require('util');

var http = require('http')
  , server = http.createServer(app);

// var https = require('https')
//   , options = {
// 		key: fs.readFileSync('ssl/privatekey.pem'),
// 		cert: fs.readFileSync('ssl/certificate.pem')
// 	}
//   , server = https.createServer(options, app);

var io = require('socket.io').listen(server);

app.configure(function() {
	var rootPath = __dirname;
	//var rootPath = __dirname + '/extjs_publish';
	util.log('rootPath: '+rootPath);
	app.use(express.static(rootPath));
});

io.set('log level', 1);

util.log('argv: ' + process.argv);
var port = process.argv[2] || 3000;
util.log('port: ' + port);
server.listen(port);

var clientMap = {};

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
			//console.log('queue delete. size='+this.queue.length);
		}
	},
	getAll : function() {
		return [].concat(this.queue);
	}
};
var msgQueue = new Queue(20);
var figureQueue = new Queue(20);

io.sockets.on('connection', function (socket) {
	//util.log('io.sockets.clients:'+io.sockets.clients());
	/*
	var target = socket;
	for (var i in target) {
		util.log(i+' : '+typeof target[i]);
	}
	*/

	socket.on('chat start', function(data) {
		//util.log('chat start: ' + JSON.stringify(data));
		var userName = data.name;
		if (userName.length > 100) {
			userName = userName.substring(0, 100) + '...';
		}
		var userAgent = '' + socket.handshake.headers['user-agent'];
		if (userAgent.length > 256) {
			userAgent = userAgent.substring(0, 256) + '...';
		}

		var userData = {
			id : socket.id,
			name : userName,
			host : socket.handshake.address.address,
			addr : socket.handshake.address.address,
			loginDate : new Date().getTime(),
			userAgent : userAgent
		};
		util.log('<+> add connection: '+JSON.stringify(userData));

		clientMap[socket.id] = userData;

		socket.emit('chat setup', {
			myData : userData,
			users : (function() {
				var userList = [];
				for (var i in clientMap) {
					userList.push(clientMap[i]);
				}
				return userList;
			})()
		});
		socket.emit('msgLog push', { msgList : msgQueue.getAll() });
		socket.emit('figureLog push', { figureList : figureQueue.getAll() });

		socket.broadcast.emit('user add', {'users' : userData, reconnect: data.reconnect});

		socket.on('message send', function(data) {
			var  msgTarget = data.msgTarget;
			var isReply = data.isReply;
			var msg = data.msg;
			if (msg.length > 2048) {
				msg = msg.substring(0, 2048) + '...';
			}

			var client = clientMap[socket.id];

			var sendMsg = {
				'isPrivate' : (msgTarget != null && '' != msgTarget),
				'msgTarget' : msgTarget,
				'isReply' : isReply,
				'time' : new Date().getTime(),
				'id' : client.id,
				'name' : client.name,
				'host' : client.host,
				'addr' : client.addr,
				'msg' : '' + msg
			};

			socket.emit('message push', sendMsg);
			if (sendMsg.isPrivate) {
				var targetSocket = io.sockets.socket(msgTarget);
				if (clientMap[msgTarget] != null && targetSocket != null) {
					var callbackCatched = false;
					targetSocket.emit('message push', sendMsg, function(callbackData) {
						callbackCatched = true;
					});
					setTimeout(function() {
						//console.log('callbackCatched:'+callbackCatched);
						if (!callbackCatched) {
							socket.emit('error push', {
								errorID : 'PRIVATEMSG_CALLBACK_UNCATCHED'
							});
						}
					}, 10*1000);
				} else {
					socket.emit('error push', {
						errorID : 'PRIVATEMSG_TARGET_NOT_EXIST'
					});
				}
			} else {
				socket.broadcast.emit('message push', sendMsg);
				msgQueue.add(sendMsg);
			}
		});

		socket.on('figure send', function(data) {
			socket.broadcast.emit('figure push', data);
			figureQueue.add(data);
		});
	});

	socket.on('disconnect', function() {
		//console.log(JSON.stringify(arguments));
		var client = clientMap[socket.id];
		if (client) {
			util.log('<-> del connection: '+JSON.stringify(client));
			delete clientMap[socket.id];
			socket.broadcast.emit('user delete', {'users' : client});
		}
	});

});

util.log('server started..');


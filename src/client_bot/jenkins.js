/**
　* サンプルBot
 */

var enable = false;
var server = {
	broadcast : function() {}
};
var userData = {
	id : new Date().getTime(),
	name : 'Sample_Bot',
	host : '∠',
	addr : '≧д≦',
	loginDate : 0,
	userAgent : '-'
};

exports.register = function(_server) {
	if (!enable) { return null; }
	server = _server;
	return userData;
};

if (!enable) {
	return;
}

//TODO
setInterval(function() {
	server.broadcast({
		'msgTarget' : null,
		'isPrivate' : false,
		'time' : new Date().getTime(),
		'id' : userData.id,
		'name' : userData.name,
		'host' : userData.host,
		'addr' : userData.addr,
		'effect' : 0,
		'msg' : 'hoge'
	});
}, 60*1000);


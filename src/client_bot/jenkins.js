/**
 * Jenkinsのビルド結果を通知するBot
 */

var enable = false;
var server = {
	broadcast : function() {}
};
var userData = {
	id : 'Jenkins_Bot_' + new Date().getTime(),
	name : 'Jenkins_Bot',
	host : '^',
	addr : 'o_o',
	loginDate : new Date().getTime(),
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


var http = require('http')
	, url = require('url')
	, util = require('util');

var host = '127.0.0.1';
var port = 8080;
var auth = 'hoge:fuga';
var projectName = 'sample';
var jobName = 'sampleJob';

var lastSuccessfulBuild = null;
var lastUnsuccessfulBuild = null;

function get(path, callback) {
	//util.log('PATH: ' + path);
	http.get({
		host: host
		,port: port
		,path: path
		,auth: auth
	}, function(res) {
		//util.log('STATUS: ' + res.statusCode);
		//util.log('HEADERS: ' + JSON.stringify(res.headers));
		res.setEncoding('utf8');
		var fullText = '';
		res.on('data', function (chunk) {
			//util.log('BODY: ' + chunk);
			fullText += chunk;
		});
		res.on('end', function() {
			try {
				var data = JSON.parse(fullText);
				//util.log(JSON.stringify(data, null, '\t'));
				callback(data);
			} catch (e) { util.log(e); }
		});
	});
}

setInterval(function() {
	get('/jenkins/'+projectName+'/job/'+jobName+'/api/json', function(data) {

		if (lastSuccessfulBuild != null && 
				data.lastSuccessfulBuild != null &&
				lastSuccessfulBuild.number < data.lastSuccessfulBuild.number) {
			get(url.parse(data.lastSuccessfulBuild.url).path + 'api/json', function(detailData) {
				//util.log('SUCCESS: ' + JSON.stringify(detailData, null, '\t'));
				var msg = 'Build SUCCESS: ' + data.lastSuccessfulBuild.url;
				util.log(msg);
				server.broadcast({
					'msgTarget' : null,
					'isPrivate' : false,
					'time' : new Date().getTime(),
					'id' : userData.id,
					'name' : userData.name,
					'host' : userData.host,
					'addr' : userData.addr,
					'effect' : 0,
					'msg' : msg
				});
			});
		}

		if (lastUnsuccessfulBuild != null && 
				data.lastUnsuccessfulBuild != null &&
				lastUnsuccessfulBuild.number < data.lastUnsuccessfulBuild.number) {
			get(url.parse(data.lastUnsuccessfulBuild.url).path + 'api/json', function(detailData) {
				//util.log('FAIL: ' + JSON.stringify(detailData, null, '\t'));
				var msg = 'Build FAIL: ' + data.lastUnsuccessfulBuild.url;
				util.log(msg);
				server.broadcast({
					'msgTarget' : null,
					'isPrivate' : false,
					'time' : new Date().getTime(),
					'id' : userData.id,
					'name' : userData.name,
					'host' : userData.host,
					'addr' : userData.addr,
					'effect' : (1<<1), //デカ文字で出す
					'msg' : msg
				});
			});
		}

		lastSuccessfulBuild = data.lastSuccessfulBuild;
		lastUnsuccessfulBuild = data.lastUnsuccessfulBuild;
	});
}, 1*60*1000);



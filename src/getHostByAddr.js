/**
 * dns.reverse でうまくホスト名が取得できないので、
 * イケてない代替手段で取得（しかも動くのはWindowsのみ...）
 * ※このファイル自体配置しなければ、dns.reverseで取得する処理が動く
 */
var childProcess = require('child_process')
	,fs = require('fs')
	,util = require('util');

exports.getHostByAddr = function(addr, defaultHostName, callback) {
	var logFile = addr + '.txt';
	function getHostName() {
		var hostName = null;
		try {
			var dataStr = fs.readFileSync(logFile, 'ascii');
			// util.log(dataStr);
			var lines = dataStr.split('\n');
			var unique = null;
			var group = null;
			for (var i=0,l=lines.length; i<l; i++) {
				var line = lines[i];
				if (unique == null && (/ unique /i).test(line)) {
					var match = line.match(/^\s+([0-9a-zA-Z\-\_]+)/);
					if (match != null) { unique = match[1]; }
				}
				if (group == null && (/ group /i).test(line)) {
					var match = line.match(/^\s+([0-9a-zA-Z\-\_]+)/);
					if (match != null) { group = match[1]; }
				}
				if (group != null && unique != null) {
					break;
				}
			};
			// util.log('unique='+unique+' group='+group);
			if (unique != null || group != null) {
				hostName = unique + '.' + group;
			}
		} catch (e) {
			util.log(e);
			return null;
		}
		return hostName;
	}

	if (fs.existsSync(logFile)) {
		var hostName = getHostName();
		if (hostName != null) {
			callback(hostName);
			return;
		}
	}

	var command = 'start /WAIT cmd /C "chcp 437 & nbtstat -A ' + addr + ' > ' + logFile + '"';
	childProcess.exec(command, function(error, stdout, stderr) {
		// util.log(stdout);
		if (error || stderr.length > 0) {
			util.log('command error: command="'+command
				+'" result='+JSON.stringify({error:error, stdout:stdout, stderr:stderr}));
		}
		if (fs.existsSync(logFile)) {
			var hostName = getHostName();
			if (hostName != null) {
				callback(hostName);
				return;
			}
		}
		callback(defaultHostName);
	});
};

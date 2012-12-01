/**
 * dns.reverse でうまくホスト名が取得できないので、
 * イケてない代替手段で取得（しかも動くのはWindowsのみ...）
 * ※このファイル自体配置しなければ、dns.reverseで取得する処理が動く
 */
var childProcess = require('child_process');

exports.getHostByAddr = function(addr, defaultHostName, callback) {
	var command = 'ping -n 1 -a ' + addr;
	childProcess.exec(command, function(error, stdout, stderr) {
		// util.log(stdout);
		if (error || stderr.length > 0) {
			util.log('command error: command="'+command
				+'" result='+JSON.stringify({error:error, stdout:stdout, stderr:stderr}));
			callback(defaultHostName);
			return;
		}
		var hostName;
		try {
			var result = stdout.toString().replace(/\r|\n/g, ' ').split(' ');
			// util.log(result);
			for (var i=0,l=result.length; i<l; i++) {
				var item = result[i];
				if (item == '') { continue; }
				if (item == 'Pinging') { continue; } //WIndowsXP
				hostName = item;
				break;
			};
		} catch (e) {
			util.log(e);
			callback(defaultHostName);
			return;
		}
		callback(hostName);
	});
};

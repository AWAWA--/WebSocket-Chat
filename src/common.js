
var common = {};

common.encryptByAES = (function() {
	var reg = /[^\u0000-\u007F]/g;
	function unicodeEscape(str) {
		// AESで暗号化→複合化すると日本語がうまく復元されないので、エスケープしておく 
		return str.replace(reg, function(c){
			var hex　= c.charCodeAt(0).toString(16);
			// console.log(hex);
			switch(hex.length) {
			case 1:
				hex = '\\u000' + hex;
				break;
			case 2:
				hex = '\\u00' + hex;
				break;
			case 3:
				hex = '\\u0' + hex;
				break;
			default:
				hex = '\\u' + hex;
				break;
			}
			return hex;
		});
	}
	return function(data, key) {
		if (!APP_CONFIG.ENCRYPTION) { return data; }
		var str = unicodeEscape(JSON.stringify(data));
		var encryptedData = cryptico.encryptAESCBC(str, key);
		encryptedData = cryptico.encryptAESCBC(encryptedData, key); //念のため
		// console.log('encrypt before: ' + str);
		// console.log('encrypt after: ' + encryptedData);
		return encryptedData;
	};
})();

common.decryptByAES = (function() {
	return function(str, key) {
		if (!APP_CONFIG.ENCRYPTION) { return str; }
		var decryptedData = cryptico.decryptAESCBC(str, key);
		decryptedData = cryptico.decryptAESCBC(decryptedData, key); //念のため
		// console.log('decrypt before: ' + str);
		// console.log('decrypt after: ' + decryptedData);
		return JSON.parse(decryptedData);
	};
})();

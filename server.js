/**
 * Created by wujiangwei on 16/5/4.
 */

'use strict';
var AV = require('leanengine');

//var APP_ID = process.env.LC_APP_ID || 'rBMsNNTFEhPsIOpmC3V9hMQA-gzGzoHsz';
//var APP_KEY = process.env.LC_APP_KEY || '3fxdvjsqHrd2LIVBqpS23A9N';
//var MASTER_KEY = process.env.LC_APP_MASTER_KEY || 'mK0myEemUe7RqzLifjnAYVgN';

//测试服务器
var APP_ID = process.env.LC_APP_ID || 'wE0Latdv4MLlP3g89PFryaRb-gzGzoHsz';
var APP_KEY = process.env.LC_APP_KEY || '5zTMEbLD5ftLLjTLFkb3a759';
var MASTER_KEY = process.env.LC_APP_MASTER_KEY || 'Xm2ejLLlrpSMENRxIo3qAgRW';

AV.initialize(APP_ID, APP_KEY, MASTER_KEY);
// 如果不希望使用 masterKey 权限，可以将下面一行删除
AV.Cloud.useMasterKey();

var app = require('./app');

// 端口一定要从环境变量 `LC_APP_PORT` 中获取。
// LeanEngine 运行时会分配端口并赋值到该变量。
var PORT = parseInt(process.env.LC_APP_PORT || 3000);
app.listen(PORT, function () {
    console.log('Node app is running, port:', PORT);
});
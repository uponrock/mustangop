'use strict';
var express = require('express');
var AV = require('leanengine');
var router = express.Router();
var util = require('./util');
var https = require('https');
var User = AV.Object.extend('_User');
var messageLogger = AV.Object.extend('messageLogger');
var accountJournal = AV.Object.extend('accountJournal'); // 记录账户变动明细表


var Base64 = require('../public/javascripts/vendor/base64').Base64;

// 用户注册
router.post('/getSmsCode', function(req, res) {
  var userphone = req.body.mobile;

  AV.Cloud.requestSmsCode(userphone).then(function() {
    //发送成功
    res.json({'errorId':0, 'errorMsg':''});
  }, function(error) {
    //发送失败
    res.json({'errorId':error.code, 'errorMsg':error.message});
  });
});

router.post('/register', function(req, res, next) {
  var userphone = req.body.mobile;
  var password = req.body.password;
  var smsCode = req.body.smsCode;

  var user = new AV.User();
  user.signUpOrlogInWithMobilePhone({
    mobilePhoneNumber: userphone,
    smsCode: smsCode,
    password:password,
    username:userphone,
    feedingMoney:1000,
    totalMoney:1000,
    remainMoney:1000
  }).then(function(user) {
    //注册或者登录成功

    var user_id = user.id;
    var userNickname = user.get('userNickname');
    //encode userid
    var encodeUserId = Base64.encode(user_id);
    //login succeed,response cookie to browser
    //cookie 30天有效期
    res.cookie('username', user.get('username'));
    res.cookie('userIdCookie',encodeUserId, { maxAge: 1000*60*60*24*30,httpOnly:true, path:'/'});
    if (userNickname != undefined && userNickname != ''){
      res.cookie('username', userNickname)
    }
    res.json({'errorId':0, 'errorMsg':''});

  }, function(error) {
    // 失败
    res.json({'errorId':error.code, 'errorMsg':error.message});
  });

});

router.get('/', function(req, res, next) {
  res.render('userCenter');
});


//个人中心
router.get('/userCenter',function(req, res, next){
  var userId = util.useridInReq(req);
  var userNickname = req.body.userNickname;
  var userQQ = req.body.userQQ;

  var query = new AV.Query(User);
  query.get(userId).then(function(results){
    var PhoneNumber = results.get('mobilePhoneNumber');
    var userNickname = results.get('userNickname');
    var userQQ = results.get('userQQ');
    var balance = results.get('remainMoney');


    res.json({'personAPP':PhoneNumber, 'userNickname':userNickname, 'userQQ':userQQ, 'balance': balance});
  }), function(error){
    //失败
    res.json({'errorId':error.code, 'errorMsg':error.message});
  }
});


// 我的Y币 消耗
router.get('/mypayYB', function(req, res){
  var userId = util.useridInReq(req);
  var myDate = new Date();
  var myDateStr = myDate.getFullYear() + '-' + (parseInt(myDate.getMonth())+1) + '-' + myDate.getDate();

  var user = new AV.User();
  user.id = userId;

  var query = new AV.Query(accountJournal);
  query.equalTo('payYCoinUser', user);
  query.equalTo('releaseDate', myDateStr);
  query.find().then(function(results){
    var userpayYCoinList = new Array();
    for (var i = 0; i < results.length; i++){
      var userpayYB = results[i].get('payYCoin');
      userpayYCoinList.push(userpayYB);
    }
    var payYB = '';
    if (userpayYCoinList.length > 0){
      payYB = eval(userpayYCoinList.join('+'))
    }else {
      payYB = 0
    }
    res.json({'todyPayYB':payYB})

  })
});

// 得到
router.get('/myincomeYB', function(req, res){
  var userId = util.useridInReq(req);
  var myDate = new Date();
  var myDateStr = myDate.getFullYear() + '-' + (parseInt(myDate.getMonth())+1) + '-' + myDate.getDate();

  var user = new AV.User();
  user.id = userId;

  var query = new AV.Query(accountJournal);
  query.equalTo('incomeYCoinUser', user);
  query.equalTo('releaseDate', myDateStr);
  query.equalTo('incomeYCoinStatus', 'incomed');
  query.find().then(function(results){
    var userincomeYCoinList = new Array();
    for (var i = 0; i < results.length; i++){
      var userincomeYB = results[i].get('incomeYCoin');
      userincomeYCoinList.push(userincomeYB);
    }
    var incomeYB = '';
    if (userincomeYCoinList.length > 0){
      incomeYB = eval(userincomeYCoinList.join('+'))
    }else {
      incomeYB = 0
    }
    res.json({'usertodyIncome':incomeYB})

  })
});

//个人中心用户保存信息
router.post('/userCenter',function(req, res){
  var userId = util.useridInReq(req);
  var userNickname = req.body.userNickname;
  var userQQ = req.body.userQQ;

  var user = AV.Object.createWithoutData('User', userId);
  user.set('userNickname', userNickname);
  user.set('userQQ',userQQ);
  user.save().then(function(){
    //保存成功

    //cookie 30天有效期
    res.cookie('username', user.get('username'), { maxAge: 1000*60*60*24*30, path:'/'});
    if (userNickname != undefined && userNickname != ''){
      res.cookie('username',userNickname);
    }

    res.json({'errorId':0, 'errorMsg':''});
  },function(error){
    res.json({'errorId':-1, 'errorMsg':error.message});
  })

});

//个人中心获取信息
router.get('/userCenter/getMessage', function(req, res){
  var userId = util.useridInReq(req);
  var user = new AV.User();
  user.id = userId;
  var query = new AV.Query(messageLogger);
  query.equalTo('receiverObjectId', user);
  query.descending('createdAt');
  query.find().then(function(results){
    var rtnMsgs = new Array();
    for (var i = 0; i < results.length; i++){
      var msg = Object();
      msg.id = results[i].id;
      msg.category = results[i].get('category');
      msg.type = results[i].get('type');
      msg.time = results[i].createdAt;
      msg.para1 = results[i].get('firstPara');
      if (msg.para1 == undefined){
        msg.para1 = ''
      }else if (msg.para1.length > 16){
        msg.para1 = msg.para1.substring(0, 16) + '...';
      }
      msg.para2 = results[i].get('secondPara');
      msg.para3 = results[i].get('thirdPara');
      msg.read = results[i].get('read');
      rtnMsgs.push(msg);
    }
    var encodedId = Base64.encode(userId);
    res.json({'rtnMsg': rtnMsgs, 'yourId': encodedId});
  })
})

//更新已读未读消息
router.post('/userCenter/readMsg', function(req, res) {
  console.log("runned");
  var msgIdArray = req.body.msgIdArray;
  var msgObjectArray = new Array()
  for (var i = 0; i < msgIdArray.length; i++) {
    var msgObject = new messageLogger();
    msgObject.id = msgIdArray[i];
    msgObject.set('read', true);
    msgObjectArray.push(msgObject);
  }
  AV.Object.saveAll(msgObjectArray);
  res.json({'errorMsg': ''});
})

router.get('/register', function(req, res, next) {
  //res.send('user register :' + encodeUserId);
  res.render('register');
});

router.get('/login', function(req, res, next) {
  res.render('login');
});

router.post('/login', function(req, res, next) {
  var userPhone = req.body.mobile;
  var password = req.body.password;

  AV.User.logIn(userPhone, password).then(function(user) {
    // 成功了，现在可以做其他事情了
    var user_id = user.id;
    //encode userid
    var encodeUserId = Base64.encode(user_id);
    var userNickname = user.get('userNickname');
    //login succeed,response cookie to browser
    //cookie 30天有效期
    res.cookie('username', user.get('username'), { maxAge: 1000*60*60*24*30, path:'/'});
    //res.cookie('wjwtest', 'wujiangweiLucy');
    res.cookie('userIdCookie',encodeUserId, { maxAge: 1000*60*60*24*30, path:'/'});
    //res.cookie['username'] = user.username;
    if (userNickname != undefined && userNickname != ''){
      res.cookie('username',userNickname);
    }

    res.json({'errorId':0, 'errorMsg':''});
  }, function(error) {
    // 失败了
    res.json({'errorId':error.code, 'errorMsg':error.message});
  });
});

router.get('/forget', function(req, res, next) {

  //获取cookie的值
  var encodeUserId = req.cookies.userIdCookie;

  //鉴别cookie是否存在
  if ('undefined' === (typeof req.cookies.userIdCookie)){
    res.send('cookie not exist,need relogin');
  }

  var user_id = Base64.decode(encodeUserId);

  //do the case

  res.send('user id =' + user_id);
});

router.get('/forgetSecret', function(req, res, next) {
  res.render('forgetSecret');
});

router.post('/getNewSmsCode', function(req, res, next) {
  var userphone = req.body.mobile;
  AV.User.requestPasswordResetBySmsCode(userphone).then(function() {
    // 密码重置请求已成功发送
    res.json({'errorId':0, 'errorMsg':''});
  }, function(error) {
    // 记录失败信息
    console.log('Error: ' + error.code + ' ' + error.message);
  });

});

// 重置密码
router.post('/forgetSecret', function(req, res, next) {
  var smsCode = req.body.smsCode;
  var newSecret = req.body.newPassword;
  AV.User.resetPasswordBySmsCode(smsCode, newSecret, {
    success: function() {
      // 密码被成功更新
      res.json({'errorId':0, 'errorMsg':''});
    },
    error: function(error) {
      // 记录失败信息
      console.log('Error: ' + error.code + ' ' + error.message);
    }
  });
});

module.exports = router;

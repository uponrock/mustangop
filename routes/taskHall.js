/**
 * Created by wujiangwei on 16/8/31.
 */
var express = require('express');
var router = express.Router();
var AV = require('leanengine');
var Base64 = require('../public/javascripts/vendor/base64').Base64;

var tempUserSQL = AV.Object.extend('tempUser');
var mackTaskSQL = AV.Object.extend('mackTaskInfo');
var receiveTaskSQL = AV.Object.extend('receiveTaskObject');
var releaseTaskSQL = AV.Object.extend('releaseTaskObject');

//任务到小马的过滤策略
//1.发布任务大于10,剩下的任务全部到小马中
var funnelExcCount = 0;
//2.下午3Pm后,2端任务同时进行
var funnelHour = 15;

//默认Y币转人名币汇率
var YCoinToRMBRate = 0.45;

//小马领取任务超时时间
var tempTaskMaxTime = 1000 * 60 * 60;
//var tempTaskMaxTime = 1000 * 6;

function taskObjectToDic(taskObject, isOpen){
    if(taskObject != undefined || taskObject.get('appObject') != undefined){
        var taskDic = Object();
        var appObject = taskObject.get('appObject');
        if(appObject == undefined){
            return undefined;
        }

        taskDic.taskId = taskObject.id;
        taskDic.appIcon = appObject.get('artworkUrl100');
        taskDic.appName = appObject.get('trackName');
        var priceStr = appObject.get('formattedPrice');
        if(priceStr != '免费'){
            taskObject.appPrice = priceStr;
        }

        if(isOpen == true){
            taskDic.remainCount = taskObject.get('remainCount');
        }else {
            //maybe negative
            taskDic.remainCount = taskObject.get('remainCount') - funnelExcCount;
        }
        taskDic.doTaskPrice = taskObject.get('tempUserPrice');
        if(taskDic.doTaskPrice == 0){
            taskDic.doTaskPrice = taskObject.get('rateUnitPrice')/10 * YCoinToRMBRate;
        }

        //正在做的任务
        taskDic.doingCount = appObject.get('doingCount');

        taskDic.taskExtraDemands = appObject.get('taskExtraDemands');//Array

        return taskDic;
    }

    return undefined;
}

//获取任务大厅任务
router.get('/:type/:userCId/:page', function(req, res, next) {
    if(req.params.userCId == 'null'){
        res.json({'errorId': -1, 'message': 'not register user'});
        return;
    }
    var userCId = Base64.decode(req.params.userCId);
    var page = req.params.page;
    var type = req.params.type; //1下载 2评论
    var taskType;
    if(type == 1){
        taskType = '下载';
    }else if(type == 2){
        taskType = '评论';
    }
    if (userCId == undefined){
        //generation header code
        res.json({'errorId': -1, 'message': 'not register user'});
    }else {
        var tempUserQuery = new AV.Query(tempUserSQL);
        tempUserQuery.get(userCId).then(function (tempUserObject) {

            //获取用户做过的任务(1个App同一版本用户只能做一次)
            //doTaskInfoSQL 都是有效任务(含有效锁定和已做过)
            var doTaskQuery = new AV.Query(receiveTaskSQL);
            doTaskQuery.equalTo('tempUserObject', tempUserObject);
            //最新1000个即可(模糊精准)
            doTaskQuery.descending('createdAt');
            doTaskQuery.limit(1000);

            var releaseTaskQuery = new AV.Query(releaseTaskSQL);
            //releaseTaskQuery.doesNotMatchKeyInQuery('excUniqueCode', 'excUniqueCode', doTaskQuery);
            var myDate = new Date();
            //需要当天的任务才可以
            if(myDate.getHours() <= funnelHour) {
                releaseTaskQuery.greaterThanOrEqualTo('excCount', funnelExcCount);
            }
            if(taskType != undefined){
                releaseTaskQuery.equalTo('taskType', taskType);
            }

            releaseTaskQuery.equalTo('close', false);
            releaseTaskQuery.equalTo('cancelled', false);

            var pageCount = 20;
            releaseTaskQuery.include('appObject');
            releaseTaskQuery.skip(page * pageCount);
            releaseTaskQuery.limit(pageCount);
            releaseTaskQuery.descending('remainCount');
            releaseTaskQuery.descending('createdAt');
            releaseTaskQuery.find().then(function(datas){

                var retArray = Array();
                for(var i = 0; i < datas.length; i++){
                    var taskInfo = taskObjectToDic(datas[i], myDate.getHours() >= funnelHour);
                    if(taskInfo != undefined){
                        retArray.push(taskInfo);
                    }
                }
                res.json({'errorId': 0, 'message': '', 'tasks': retArray});

            }, function(error){
                res.json({'errorId': error.code, 'message': error.message});
            });

            //task check

        }, function (error) {
            res.json({'errorId': error.code, 'message': error.message});
        });
    }

    //get unique userCode
});

//锁定任务(30分钟),定时器,30分钟后,看任务有没有做完,未作完,则释放锁,删除相关数据
//获取任务大厅任务
router.post('/lockTask', function(req, res) {
    var userCId = Base64.decode(req.body.userCId);
    var taskObjectId = req.body.taskId;

    var myDate = new Date();
    var myDateStr = myDate.getFullYear() + '-' + (parseInt(myDate.getMonth())+1) + '-' + myDate.getDate();

    //任务ID
    var releaseQuery = new AV.Query(releaseTaskSQL);
    releaseQuery.get(taskObjectId).then(function (releTaskObject) {

        if(releTaskObject.get('close') == true){
            res.json({'errorId': -2, 'message': '任务已关闭,不能领取哦'});
        }else if(releTaskObject.get('cancelled') == true){
            res.json({'errorId': -2, 'message': '任务刚被发布者撤销,看看别的任务吧'});
        }else {
            var tempUserPrice = releTaskObject.get('tempUserPrice');
            var appObject = releTaskObject.get('appObject');
            var excUniqueCode = releTaskObject.get('excUniqueCode');

            //后端效验
            var flag = true;
            var errorMsg = '';

            var tempUser = new tempUserSQL();
            tempUser.id = userCId;

            //1.不得重复领取同一任务
            var query = new AV.Query(receiveTaskSQL);
            query.equalTo('tempUserObject', tempUser);
            query.equalTo('taskObject', releTaskObject);
            query.equalTo('appObject', appObject);
            query.include('taskObject');
            query.find().then(function(results){
                if (results.length > 0){
                    errorMsg = "任务已经被领取过";
                    flag = false;
                    res.json({'errorId': -2, 'message': errorMsg});
                }else {
                    //剩余条数
                    var remainCount = releTaskObject.get('remainCount');
                    var myDate = new Date();
                    //需要当天的任务才可以
                    if(myDate.getHours() <= funnelHour) {
                        if(remainCount <= funnelExcCount){
                            console.log('temp user task get failed because of task done(less than 10)');
                            errorMsg = "抱歉, 任务被别的用户抢走了";
                            res.json({'errorId': -1, 'errorMsg': errorMsg});
                            return;
                        }
                    }else {
                        if (remainCount < 1){
                            console.log('temp user task get failed because of task done(less than 1)');
                            errorMsg = "抱歉, 任务被别的用户抢走了";
                            res.json({'errorId': -1, 'errorMsg': errorMsg});
                            return;
                        }
                    }
                    //可以领取任务
                    //后端效验通过
                    var tempUser = new tempUserSQL();
                    tempUser.id = userCId;
                    var ReceiveTaskObject = new receiveTaskSQL();
                    ReceiveTaskObject.set('tempUserObject', tempUser);
                    ReceiveTaskObject.set('taskObject', releTaskObject);
                    ReceiveTaskObject.set('appObject', appObject);
                    ReceiveTaskObject.set('receiveCount', 1);
                    ReceiveTaskObject.set('tempUserPrice', tempUserPrice);

                    ReceiveTaskObject.set('excUniqueCode', excUniqueCode);//换评信息
                    ReceiveTaskObject.set('receiveDate', myDateStr);


                    //小马试客,不计入定时器
                    ReceiveTaskObject.set('timerDone', true);

                    releTaskObject.increment('remainCount', -1);
                    releTaskObject.increment('doingCount', 1);

                    var needSavedTasks = [releTaskObject, ReceiveTaskObject];

                    AV.Object.saveAll(needSavedTasks).then(function(avobjs){
                        var doTaskId;
                        var taskCreatedAt;
                        for (var i = 0; i < avobjs.length; i++){
                            if(avobjs[i].get('tempUserObject') != undefined){
                                doTaskId = avobjs[i].id;
                                taskCreatedAt = avobjs[i].createdAt;
                                break;
                            }
                        }

                        setTimeout(unlockTaskIfNeeded, tempTaskMaxTime, doTaskId);
                        res.json({'errorId': 0, 'message': 'lock task succeed', 'lockTaskId': doTaskId, 'doTaskCreatedAt': taskCreatedAt});
                    }, function(error){
                        res.json({'errorId': error.code, 'errorMsg': error.message});
                    });
                }
            });
        }

    }, function (error) {
        // 失败了
        res.json({'errorId': error.code, 'errorMsg': error.message});
    });
});

//超时后核实锁定任务
function unlockTaskIfNeeded(){
    var lockTaskId = arguments[0];
    return unlockTaskWithRes(lockTaskId, undefined);
}

function unlockTaskWithRes(lockTaskId, res){
    var receTaskQuery = new AV.Query(receiveTaskSQL);
    receTaskQuery.include('taskObject');
    receTaskQuery.include('tempMackTask');
    receTaskQuery.get(lockTaskId).then(function(receTaskObject){
        var taskObject = receTaskObject.get('taskObject');
        var doTaskObject = receTaskObject.get('tempMackTask');
        if(doTaskObject == undefined){
            //任务超时未做
            taskObject.increment('doingCount', -1);
            taskObject.increment('remainCount', 1);

            //close rece task object and expired = 1
            receTaskObject.set('close', true);
            receTaskObject.set('expiredCount', 1);

            if(res == undefined){
                //任务超时(未取消)(不可在做该任务)
                AV.Object.saveAll([taskObject, receTaskObject]).then(function(){
                    console.info('user ' + receTaskObject.get('tempUserObject').id + ' unlock task ' + lockTaskId + ' succeed');
                }, function(error){
                    console.error('---------- timer !!!!!!!!!! user ' + receTaskObject.get('tempUserObject').id + ' unlock task ' + lockTaskId + ' failed');
                });
            }else {
                //主动取消了任务(还可以做)
                //回退任务条数
                taskObject.save().then(function(){
                    receTaskObject.destroy().then(function (success) {
                        // 删除任务记录成功(下次还可以做)
                        res.json({'errorId': 0, 'message': 'unlock succeed'});
                    }, function (error) {
                        // 删除失败
                        console.error('---------- manual unlock !!!!!!!!!! receive task destory error ' + receTaskObject.get('tempUserObject').id + ' unlock task ' + lockTaskId + ' failed');
                        res.json({'errorId': error.code, 'message': error.message});
                    });
                }, function (error) {
                    console.error('---------- manual unlock !!!!!!!!!! task save error ' + receTaskObject.get('tempUserObject').id + ' unlock task ' + lockTaskId + ' failed');
                    res.json({'errorId': error.code, 'message': error.message});
                });
            }
        }else {
            //TODO: 思考被拒绝?
        }
    }, function (error) {
        if(res != undefined) {
            res.json({'errorId': error.code, 'message': error.message});
        }
    });
}

//放弃锁定任务
router.post('/unlockTask', function(req, res) {
    var lockTaskId = req.body.lockTaskId;
    unlockTaskWithRes(lockTaskId, res);
});

//任务详情 + 用户的任务状态
router.get('/:userCId/:taskId', function(req, res, next) {
    var userCId = Base64.decode(req.params.userCId);
    var taskId = req.params.taskId;

    //TODO 任务详情
    var releaseTaskQuery = new AV.Query(releaseTaskSQL);
    releaseTaskQuery.include('appObject');
    releaseTaskQuery.get(taskId).then(function(releaseTaskObject){
        var taskDetailDic = Object();

        //任务信息
        var appObject = releaseTaskObject.get('appObject');
        if(appObject == undefined){
            console.error('temp user get task info error:' + 'app not exist');
            res.json({'errorId': -1, 'message': 'app not exist'});
            return;
        }

        taskDetailDic.appIcon = appObject.get('artworkUrl100');
        taskDetailDic.appName = appObject.get('trackName');
        var priceStr = appObject.get('formattedPrice');
        if(priceStr != '免费'){
            taskDetailDic.appPrice = priceStr;
        }

        taskDetailDic.taskType = releaseTaskObject.get('taskType');
        if(taskDetailDic.taskType == '下载'){
            taskDetailDic.taskPicCount = 2;
        }else if(taskDetailDic.taskType == '评论'){
            taskDetailDic.taskPicCount = 3;
        }
        taskDetailDic.doTaskPrice = releaseTaskObject.get('tempUserPrice');
        if(taskDetailDic.doTaskPrice == 0){
            taskDetailDic.doTaskPrice = releaseTaskObject.get('rateUnitPrice')/10 * YCoinToRMBRate;
        }


        //用户有没有接受过任务
        var tempUser = new tempUserSQL();
        tempUser.id = userCId;

        var receTaskQuery = new AV.Query(receiveTaskSQL);
        receTaskQuery.equalTo('tempUserObject', tempUser);
        receTaskQuery.equalTo('taskObject', releaseTaskObject);
        receTaskQuery.include('tempMackTask');
        receTaskQuery.descending('createdAt');

        receTaskQuery.find().then(function(receObjects){
            if(receObjects.length > 0){
                //have lock task,need count down
                taskDetailDic.lockTaskId = receObjects[0].id;
                taskDetailDic.doTaskCreatedAt = receObjects[0].createdAt;
                var tempMackTask = receObjects[0].get('tempMackTask');
                if(tempMackTask != undefined){
                    taskDetailDic.doTaskImgs = tempMackTask.get('requirementImgs');
                    taskDetailDic.doTaskStatus = tempMackTask.get('taskStatus');
                }else if(receObjects[0].get('expiredCount') == 1){
                    //超时未完成
                    taskDetailDic.doTaskStatus = 'expired';
                }
            }

            res.json({'errorId': 0, 'message': '', 'taskDetail': taskDetailDic});
        }, function(error){
            res.json({'errorId': 0, 'message': 'get rece info error', 'taskDetail': taskDetailDic});
        });

    }, function(error){
        console.error('temp user get task info error:' + error.message);
        res.json({'errorId': error.code, 'message': error.message});
    });
});

//小马用户上传任务
router.post('/tempUserDoTask', function(req, res){
    var userCId = Base64.decode(req.params.userCId);
    var taskId = req.body.taskId;
    var requirementImgs = req.body.requirementImgs;

    if(requirementImgs == undefined || requirementImgs.length == 0){
        res.json({'message':'未上传图片', 'errorId': -3});
        return;
    }

    var tempUserQuery = new AV.Query(tempUserSQL);
    tempUserQuery.get(userCId).then(function (tempUserObject) {

        var userUploadName = tempUserObject.get('userCodeId');

        var receiveTaskQuery = new AV.Query(receiveTaskSQL);
        receiveTaskQuery.include('taskObject');
        receiveTaskQuery.include('userObject');
        receiveTaskQuery.include('taskObject.userObject');
        receiveTaskQuery.get(taskId).then(function(receiveTaskObject){
            var tempMackObject = receiveTaskObject.get('tempMackTask');
            var taskObject = receiveTaskObject.get('taskObject');

            //这边必须不包含过期条目,因为expiredCount已经包含了
            if(receiveTaskObject.get('expiredCount') == 1){
                //任务已经做满,不能重新再上传
                res.json({'message':'任务已经超时,不在可以参加任务', 'errorId': -200});
            }else {
                if(tempMackObject == undefined){
                    //new task
                    tempMackObject = new mackTaskSQL();
                    tempMackObject.set('uploadName', userUploadName);
                    tempMackObject.set('requirementImgs', requirementImgs);
                    tempMackObject.set('taskStatus', 'uploaded');
                    tempMackObject.set('receiveTaskObject', receiveTaskObject);

                    //小马试客 做任务的人
                    tempMackObject.set('tempUserObject', tempUserObject);
                    //发布任务的人
                    tempMackObject.set('releaseTaskObject', taskObject);
                    tempMackObject.set('releaseTaskUser', taskObject.get('userObject'));
                }else {
                    //该用户已经做过任务,想重新传图
                    var taskStatus = tempMackObject.get('taskStatus');
                    if (taskStatus == 'accepted' || taskStatus == 'systemAccepted'){
                        //任务已经完成,无需再做
                        res.json({'message':'任务已经完成喽', 'errorId': -100});
                    }else if (taskStatus == 'refused') {
                        //TODO 小马试客不允许做被拒绝的任务
                        res.json({'message':'任务失败(被拒绝),有疑问联系客服', 'errorId': -101});
                    }else if (taskStatus == 'expired') {
                        res.json({'message':'任务已经超时过期', 'errorId': -101});
                    }else {
                        //自己重新提交,或者被拒绝后重新做任务
                        //销毁以往图片
                        var images = tempMackObject.get('requirementImgs');
                        var query_file = new AV.Query(File);
                        query_file.containedIn('url', images);
                        query_file.find().then(function(imgResults){
                            for (var e = 0; e < imgResults.length; e++){
                                imgResults[e].destroy().then(function(){
                                    //remove success
                                })
                            }
                        });

                        tempMackObject.set('requirementImgs', requirementImgs);
                        //区分 自己提交和 拒绝后提交
                        if (taskStatus == 'refused'){
                            tempMackObject.set('taskStatus', 'reUploaded');
                        }else {
                            tempMackObject.set('taskStatus', 'uploaded');
                        }
                    }

                    tempMackObject.save().then(function(){
                        res.json({'errorId':0, 'message':'', 'requirementImgs':requirementImgs});
                    }, function (error) {
                        //更新任务失败
                        console.error('upload task img failed(save task):' + taskStatus + 'error:' + error.message);
                        res.json({'errorMsg':error.message, 'uploadName':userUploadName, 'errorId': error.code});
                    });
                }
            }
        }, function(error){
            console.error('upload task img failed(receive task object error):' + error.message);
            res.json({'errorId': error.code, 'message': error.message});
        });

    }, function (error) {
        console.error('upload task img failed(temp user object error):' + error.message);
        res.json({'errorId': error.code, 'message': error.message});
    });
});

//我的任务
router.get('/myTask/:userCId', function(req, res) {
    var userCId = Base64.decode(req.params.userCId);
    var tempUser = new tempUserSQL();
    tempUser.id = userCId;

    var maxShowInvalidTask = 3;

    //小马试客,我的任务
    var query = new AV.Query(receiveTaskObject);
    query.equalTo('tempUserObject', tempUser);
    query.equalTo('timerDone', true);
    query.notEqualTo('close', true);
    query.lessThanOrEqualTo('showTimer', maxShowInvalidTask);

    query.include('taskObject');
    query.include('appObject');
    query.include('tempMackTask');
    query.descending('createdAt');


    query.find().then(function(results){
        //已完成/过期任务 3次展示后自动消失

        var retList = [];
        var undoTask = 0;
        var willGetRmb = 0;
        var needSaveReceList = [];

        for (var i = 0; i < results.length; i++){
            var receTaskObject = results[i];
            var taskObject = receTaskObject.get('taskObject');
            var appObject = receTaskObject.get('appObject');
            var tempMackObject = receTaskObject.get('tempMackTask');

            var myTaskDic = Object();
            if(appObject == undefined){
                continue;
            }

            myTaskDic.taskId = taskObject.id;
            myTaskDic.createdAt = receTaskObject.createdAt;
            myTaskDic.appIcon = appObject.get('artworkUrl100');
            myTaskDic.appName = appObject.get('trackName');

            myTaskDic.doTaskPrice = appObject.get('tempUserPrice');
            if(myTaskDic.doTaskPrice == undefined){
                myTaskDic.doTaskPrice = appObject.get('rateUnitPrice')/10 * YCoinToRMBRate;
            }

            //status
            if(tempMackObject == undefined){
                //未做(时间)
                undoTask++;
                willGetRmb += myTaskDic.doTaskPrice;
            }else {
                //做了
                var taskStatus = tempMackObject.get('taskStatus');
                if (taskStatus == 'uploaded' || taskStatus == 'reUploaded'){
                    //审核中(时间)
                    myTaskDic.statusDes = '审核中';
                }else if (taskStatus == 'accepted' || taskStatus == 'systemAccepted'){
                    //完成
                    myTaskDic.statusDes = '已完成';
                    receTaskObject.increment('showTimer', 1);
                    needSaveReceList.push(receTaskObject);
                }else if(taskStatus == 'refused'){
                    //拒绝
                    myTaskDic.statusDes = '被拒绝';
                    myTaskDic.refuseReason = tempMackObject.get('detail');
                }else if(taskStatus == 'expired'){
                    //过期
                    myTaskDic.statusDes = '已过期';
                    receTaskObject.increment('showTimer', 1);
                    needSaveReceList.push(receTaskObject);
                }
            }
        }

        //save
        if(needSaveReceList.length > 0){
            AV.Object.saveAll(needSaveReceList).then(function(avobjs){
                //
            }, function(error){
                //
            });
        }

        res.json({'errorId': 0, 'message': '', 'retList': retList, 'undoTask': undoTask, 'willGetRmb': willGetRmb});
    }, function(error){
        console.error('get temp user tasks error:' + error.message);
        res.json({'errorId': error.code, 'message': error.message});
    });
});

module.exports = router;

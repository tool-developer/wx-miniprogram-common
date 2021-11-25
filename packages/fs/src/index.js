/**
 * 资源管理器
 */
//微信存储目录
const USER_DATA_PATH = wx.env.USER_DATA_PATH;
const fs = wx.getFileSystemManager && wx.getFileSystemManager();
const COMPLETE_SIGN = '_COMPLETE_SIGN_';//公共资源已加载到本地标记
const PUBLIC_SIGN = 'public';
const STATIC_SIGN = 'static';
const TEMP_SIGN = 'temp';//仅仅是一个标记而已，没有对应目录
//
export const FS_SIGN = {
  PUBLIC: PUBLIC_SIGN,
  STATIC: STATIC_SIGN,
  TEMP: TEMP_SIGN
}

//单实例对象
let instance = null;
//统一返回处理
function toReturn(promise, callback) {
  //
  return promise.then(function (result) {
    //
    callback && callback(null, result);
    //
    return result;
  }, function (err) {
    //
    callback && callback(err);
    //
    return err;
  }).catch(function (err) {
    //
    //callback && callback(err);
    //
    return err;
  });
}
//
export class FS {
  /**
   * 
   * @param {*} options 
   * {
   *      zip:'',//zip资源服务器地址
   *      serverURL:'',//资源服务器地址
   *      publics:[],//资源文件名
   * }
   */
  constructor(options) {
    options = options || {};
    //
    if (!this instanceof FS) {

      return new FS(options);
    }

    if (instance) {

      return instance;
    }
    //
    let self = this;
    //
    instance = this;
    //公共资源
    this.publics = {};
    //静态资源
    this.statics = {};
    //临时资源
    this.temps = {};
    //记作完成标记
    this.completed = false;
    //将fs对象暴露出去
    this.fs = fs;

    //服务器端资源路径
    this.serverURL = options.serverURL;
    //public文件处理-启动时先做服务器资源映射，防止文件下载失败
    this.mapPublicServerFiles(options.publics);
    //static文件处理
    this.mapStaticFiles();
    //temp文件map映射
    this.mapTempUrls = {};

    //创建目录
    let publicDirPath = self.getPublicFullPath();
    let staticDirPath = self.getStaticFullPath();
    self.toMkDir(publicDirPath);
    self.toMkDir(staticDirPath);

    //下载zip包数据
    if (options.zip) {
      //
      let signFileName = self.getPublicFullPathName(COMPLETE_SIGN);
      //
      if (!self.toAccessSync(signFileName)) {

        //重新下载zip资源文件
        self.toDownloadZipFile(options.zip, function () {
          //调整为本地资源映射
          self.mapPublicFiles(options.publics);
        });
        //
        return instance;
      }
      //调整为本地资源映射
      self.mapPublicFiles(options.publics);
      //记作完成标记
      self.completed = true;
      //异步检测是否需要更新文件
      let t = setTimeout(function () {
        //
        self.toCheckUpdate(options.zip);
        //
        clearTimeout(t);
      }, 100);
    }

    return instance;
  }
  /**
   * 读取文件内容
   * @param {*} fileName 
   * @param {*} callback 
   * @returns 
   */
  read(fileName,callback){
    //
    const filePath = this.getPublicFullPathName(fileName);
    //
    return toReturn(new Promise((resolve,reject)=>{
      //
      fs.readFile({
        filePath,
        encoding: 'utf8',
        success: function (res) {
          const data = res.data;
          //
          if (data) {
            try {
              //
              resolve(data)
            } catch (e) {
              //
              reject(e);
             }
          }
        },
        fail:reject
      });
    }),callback)
  }
  /**
   * 获取内容JSON
   * @param {*} fileName 
   * @param {*} callback 
   * @returns 
   */
  readJSON(fileName,callback){
    //
    return toReturn(this.read(fileName).then((data)=>{
      try{
        //
        return JSON.parse(data);
      }catch(e){
        
        return {};
      }
    }).catch(()=>{}),callback)
  }
  /**
   * 写入文件内容
   * @param {*} fileName 
   * @param {*} data 
   * @param {*} callback 
   * @returns 
   */
  write(fileName,data,callback){
    const filePath = this.getPublicFullPathName(fileName);
    //
    return toReturn(new Promise((success,fail)=>{
      if(typeof data === 'object'){
        //
        data = JSON.stringify(data);
      }
      //
      fs.writeFile({
        filePath,
        data,
        encoding: 'utf8',
        success,
        fail
      })
    }),callback)
  }
  /**
   * 下载zip资源包到本地
   * @param {*} zipFile 
   * @param {*} callback 
   */
  toDownloadZipFile(zipFile, callback) {
    let self = this;
    if (!zipFile) {

      return console.log('zip file url is required');
    }
    //
    self.downloadZip(zipFile, function (err) {
      //
      //console.log('download zip file result', err);
      if (err) {
        //
        return console.log('download zip file error');
      }
      //写入内容需要是字符串，数字真机会报错。
      //写入格式JSON.stringify({timestamp:Date.now(),zip:zipFile})
      let data = {
        timestamp: Date.now(),
        zip: zipFile
      };//
      let signFileName = self.getPublicFullPathName(COMPLETE_SIGN);
      //
      fs.writeFileSync(signFileName, JSON.stringify(data), 'utf8');
      //记作完成标记
      self.completed = true;
      //
      callback && callback();
    });
  }
  /**
   * 检测是否需要更新资源文件
   * @param {*} zipFile 
   */
  toCheckUpdate(zipFile) {
    let self = this;
    //
    let signFileName = self.getPublicFullPathName(COMPLETE_SIGN);
    //
    fs.readFile({
      filePath: signFileName,
      encoding: 'utf8',
      success: function (res) {
        let data = res.data;
        //
        if (data) {
          try {
            data = JSON.parse(data) || {};
            let zip = data['zip'];
            if (zip && zip !== zipFile) {
              //
              self.toDownloadZipFile(zipFile);
            }
          } catch (e) { }
        }
      }
    });
  }
  /**
   * 小程序accessSync有问题
   */
  toAccessSync(dirPath) {
    try {
      //
      fs && fs.accessSync(dirPath);

      return true;
    } catch (e) { }
    //
    return false;
  }
  /**
   * 创建目录
   * @param {*} dirPath 
   */
  toMkDir(dirPath) {
    let self = this;
    try {
      if (!self.toAccessSync(dirPath)) {

        fs.mkdirSync(dirPath, true);
      }
    } catch (e) {
      console.log('to mk dir error', e);
    }
  }
  /**
   * 公共资源映射服务器地址
   * @param {*} files 
   */
  mapPublicServerFiles(files) {
    files = files || [];
    //未配置服务器端资源路径，不做服务器资源映射
    if (!this.serverURL) {

      return this.mapPublicFiles(files);
    }
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      if (file) {
        //
        this.publics[file] = this.getServerFullPathName(file, this.serverURL);
      }
    }
  }
  /**
   * 公共文件映射处理
   * 暂时不做文件是否存在的检测，也就是说需要人为保证配置中和zip中的文件是真实一对一对应的
   * @param {*} files 
   */
  mapPublicFiles(files) {
    files = files || [];
    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      if (file) {
        //
        this.publics[file] = this.getPublicFullPathName(file);
      }
    }
  }
  /**
   * 静态文件映射处理
   */
  mapStaticFiles() {
    let self = this;
    //采取异步方式
    fs.readdir && fs.readdir({
      dirPath: self.getStaticFullPath(),
      success: function (res) {
        let files = res.files;
        for (let i = 0; i < files.length; i++) {
          let file = files[i];
          if (file) {
            //
            self.statics[file] = self.getStaticFullPathName(file);
          }
        }
      }
    });
  }
  /**
   * 服务器端完整路径
   * @param {*} name 
   * @param {*} url 
   */
  getServerFullPathName(name, url) {
    //
    url = url.replace(/\/$/, '');
    name = name.replace(/^\//, '');
    //
    return [url, name].join('/');
  }
  /**
   * 获取文件名完整路径
   * @param {*} name 
   * @param {*} path 
   */
  getFullPathName(name, path) {
    path = path || STATIC_SIGN;
    //
    return [USER_DATA_PATH, path, name].join('/');
  }
  /**
   * 获取公共资源路径
   */
  getPublicFullPath() {

    return [USER_DATA_PATH, PUBLIC_SIGN].join('/');
  }
  /**
   * 获取公共资源完整路径名
   * @param {*} name 
   */
  getPublicFullPathName(name) {

    return this.getFullPathName(name, PUBLIC_SIGN);
  }
  /**
   * 获取静态资源路径
   */
  getStaticFullPath() {

    return [USER_DATA_PATH, STATIC_SIGN].join('/');
  }
  /**
   * 获取静态资源完整路径名
   * @param {*} name 
   */
  getStaticFullPathName(name) {

    return this.getFullPathName(name, STATIC_SIGN);
  }
  /**
   * 保存到资源文件管理save方法的别名
   * @param {*} fileName 
   * @param {*} tempFilePath 
   * @param {*} callback 
   */
  set(fileName, tempFilePath, callback) {

    return this.save(fileName, tempFilePath);
  }
  /**
   * 临时文件保存
   * @param {*} fileName 
   * @param {*} tempFilePath 
   * @param {*} callback 
   */
  tset(fileName, tempFilePath, callback) {

    return this.tsave(fileName, tempFilePath, callback);
  }
  /**
   * 临时文件保存
   * @param {*} fileName 
   * @param {*} tempFilePath 
   * @param {*} callback 
   */
  tsave(fileName, tempFilePath, callback) {
    //
    return toReturn(new Promise(function (resolve, reject) {
      if (!fileName) {

        let err = 'save no file name';
        //callback && callback(err);

        return reject(err);
      }
      if (!tempFilePath) {

        let err = 'save no temp file path';
        //callback && callback(err);

        return reject(err);
      }
      //
      self.temps[fileName] = tempFilePath;

      return resolve(tempFilePath);
    }), callback);
  }
  /**
   * 保存到资源管理器，只能处理静态资源，不能操作动态资源
   * save会移动源文件，也就是说save之后，临时缓存中的文件就不存在了
   * @param {*} fileName 
   * @param {*} tempFilePath 
   * @param {*} callback 
   */
  save(fileName, tempFilePath, callback) {
    let self = this;
    //
    return toReturn(new Promise(function (resolve, reject) {
      if (!fileName) {

        let err = 'save no file name';
        //callback && callback(err);

        return reject(err);
      }
      if (!tempFilePath) {

        let err = 'save no temp file path';
        //callback && callback(err);

        return reject(err);
      }
      fs.saveFile({
        tempFilePath: tempFilePath,
        filePath: self.getStaticFullPath(),
        success(res) {
          let savedFilePath = res.savedFilePath;
          if (savedFilePath) {
            //
            self.statics[fileName] = savedFilePath;
            //
            //callback && callback(null,savedFilePath);

            return resolve(savedFilePath);
          }

          let err = 'save to static error';
          //callback && callback(err);

          return reject(err);
        },
        fail(err) {
          //
          //callback && callback(err);

          return reject(err);
        }
      });
    }), callback);
  }
  /**
   * 将临时缓存文件复制到用户目录，只能处理静态资源
   * @param {*} fileName 
   * @param {*} tempFilePath 
   * @param {*} callback 
   */
  copy(fileName, tempFilePath, callback) {
    let self = this;
    //
    return toReturn(new Promise(function (resolve, reject) {
      if (!fileName) {

        let err = 'copy no file name';
        //callback && callback(err);

        return reject(err);
      }
      if (!tempFilePath) {

        let err = 'copy no temp file path';
        //callback && callback(err);

        return reject(err);
      }
      fs.copyFile({
        srcPath: tempFilePath,
        destPath: self.getStaticFullPath(),
        success(res) {
          let savedFilePath = self.getStaticFullPathName(fileName);
          //
          self.statics[fileName] = savedFilePath;
          //
          //callback && callback(null,savedFilePath);

          return resolve(savedFilePath);
        },
        fail(err) {
          //
          //callback && callback(err);

          return reject(err);
        }
      });
    }), callback);
  }
  /**
   * 获取静态资源路径
   * @param {*} fileName 
   * @param {*} callback 
   */
  sget(fileName, callback) {

    return this.get(fileName, STATIC_SIGN, callback);
  }
  /**
   * 获取公共资源路径
   * @param {*} fileName 
   * @param {*} callback 
   */
  pget(fileName, callback) {
    //
    return this.get(fileName, PUBLIC_SIGN, callback);
  }
  /**
   * 获取临时资源路径
   * @param {*} fileName 
   * @param {*} callback 
   */
  tget(fileName, callback) {

    return this.get(fileName, TEMP_SIGN, callback);
  }
  /**
   * 获取指定资源对应资源路径
   * @param {*} fileName
   * @param {*} callback  
   */
  get(fileName, type, callback) {
    self = this;
    //
    if (typeof type === 'function') {
      callback = type;
      type = '';
    }
    type = type || STATIC_SIGN;
    //
    return toReturn(new Promise(function (resolve, reject) {
      //临时资源路径
      if (type === TEMP_SIGN) {
        //
        let fullFileName = self.temps[fileName];
        if (fullFileName) {
          //检测是否临时文件还存在，不存在则使用服务器地址，依然不存在，则返回错误
          return wx.getFileInfo({
            filePath: fullFileName,
            success: function getFileInfoSuccess(res) {
              //直接返回临时文件地址
              resolve(fullFileName);
            },
            fail: function getFileInfoFail() {
              //
              let fileNameUrl = self.mapTempUrls[fileName];
              //返回的是服务器地址
              if (fileNameUrl) {

                return resolve(fileNameUrl);
              }
              //
              let err = 'no this temp file';
              //callback && callback(err);
              //
              return reject(err);
            }
          });
        }
        let err = 'no this temp file';
        //callback && callback(err);
        //
        return reject(err);
      }
      //静态资源路径
      if (type === STATIC_SIGN) {

        let fullFileName = self.statics[fileName];
        if (fullFileName) {

          //callback && callback(null,fullFileName);

          return resolve(fullFileName);
        }
        let err = 'no this static file';
        //callback && callback(err);
        //
        return reject(err);
      }
      //
      /*if (!self.completed) {
          let err = 'public not complete';
          //
          //callback && callback(err);
          //
          return reject(err);
      }*/
      //
      let fullFileName = self.publics[fileName];
      if (fullFileName) {

        //callback && callback(null,fullFileName);

        return resolve(fullFileName);
      }

      let err = 'no this public file';
      //
      //callback && callback(err);

      return reject(err);
    }), callback);
  }
  /**
   * 删除指定静态资源
   * @param {*} fileName 
   * @param {*} callback 
   */
  remove(fileName, callback) {
    let self = this;
    //
    return toReturn(new Promise(function (resolve, reject) {

      if (!fileName) {

        let err = 'remove no file name';
        //
        //callback && callback(err);

        return reject(err);
      }
      //
      let filePath = self.getStaticFullPathName(fileName);
      //
      fs.unlink({
        filePath: filePath,
        success: function (res) {
          //
          delete self.statics[fileName];
          //
          //callback && callback(null,filePath);

          return resolve(filePath);
        },
        fail: function (err) {
          //
          //callback && callback(err);

          return resolve(err);
        }
      });
    }), callback);
  }
  /**
   * 清除所有非公共资源文件
   * @param {*} callback 
   */
  clear(callback) {
    let self = this;
    //
    return toReturn(new Promise(function (resolve, reject) {
      //
      let staticDirPath = self.getStaticFullPath();
      fs.rmdir({
        dirPath: staticDirPath,
        recursive: true,
        success: function () {
          //
          self.statics = {};
          //
          //callback && callback(null,{});
          //重新创建目录
          self.toMkDir(staticDirPath);

          return resolve({});
        },
        fail: function (err) {
          //
          //callback && callback(err);

          return resolve(err);
        }
      });
    }), callback);
  }
  /**
   * 通过资源地址下载资源并保存到资源管理器
   * @param {*} options {
   *      url:
   *      header:
   *      fileName:
   * } 
   * @param {*} fileName 
   * @param {*} callback 
   */
  download(options, fileName, callback) {
    let self = this;
    //
    if (typeof fileName === 'function') {
      callback = fileName;
      fileName = options.fileName || '';
    }
    //
    if (typeof options === 'string') {
      options = {
        url: options,
        fileName: fileName
      }
    }
    //
    fileName = fileName || options.fileName;
    let type = options.type;
    //处理filePath
    if (fileName && type !== TEMP_SIGN) {
      //
      options['filePath'] = this.getStaticFullPathName(fileName);
    }
    //
    callback = callback || options.callback;

    return toReturn(new Promise(function (resolve, reject) {
      //
      options['success'] = function (res) {
        //
        let filePath = res.filePath || res.tempFilePath;
        //注入到temps
        if (type === TEMP_SIGN) {
          //
          self.temps[fileName] = res.tempFilePath;
          //映射服务器地址
          self.mapTempUrls[fileName] = options.url;
        } else if (res.filePath) {
          //注入到statics
          self.statics[fileName] = res.filePath;
        }
        //
        //callback && callback(null,filePath);
        //
        resolve(filePath);
      }
      //
      options['fail'] = function (err) {

        //callback && callback(err);

        reject(err);
      }
      //该api微信小程序内部会出错，不影响使用
      //并且外部try catch无效
      wx.downloadFile(options);
    }), callback);
  }
  /**
   * 下载临时文件
   * @param {*} options 
   * @param {*} fileName
   * @param {*} callback 
   */
  downloadTemp(options, fileName, callback) {
    //
    if (typeof options === 'string') {
      options = {
        url: options
      }
    }
    //
    options['type'] = TEMP_SIGN;

    return this.download(options, fileName, callback);
  }
  tdownload(options, fileName, callback) {

    return this.downloadTemp(options, fileName, callback);
  }
  /**
   * 通过资源地址下载zip文件
   * @param {*} resourseUrl 
   * @param {*} callback 
   */
  downloadZip(resourseUrl, callback) {
    let self = this;

    return toReturn(new Promise(function (resolve, reject) {
      //
      self.download({
        url: resourseUrl,
        callback: function (err, tempFilePath) {
          //
          if (err || !tempFilePath) {

            //callback && callback(err);
            //
            return resolve(err);
          }
          //解压zip文件
          fs.unzip({
            zipFilePath: tempFilePath,
            targetPath: self.getPublicFullPath(),
            success: function () {

              //callback && callback(self.publics);
              //
              resolve(self.publics);
            },
            fail: function (err) {

              //callback && callback(err);
              //
              reject(err);
            }
          });
        }
      })
    }), callback);
  }
}

export default FS;
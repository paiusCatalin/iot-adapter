const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const fitbit = require('./fitbitEtlService');
// const { parse } = require('csv-parse');


// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
function processFitbit(){
  fs.readFile(require('path').resolve(__dirname, 'credentials.json'), (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Drive API.
    authorize(JSON.parse(content), listFiles);
  });  
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listFiles(auth) {
  var allActivity = [];
  const drive = google.drive({version: 'v3', auth});
  drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
    q: 'mimeType=\'text/csv\''
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const files = res.data.files;
    if (files.length) {
      
      console.log('Files:');
      files.map(async (file) => {
        console.log(`${file.name} (${file.id})`);
        if(file.name == 'pulseoximeter.csv'){
          var data = await downloadFile(file.id,file.name, auth);
          var resourceSpO2 = [];
          var resourcePulse = [];
          for(let i=0; i<data.length; i++){
            resourceSpO2.push(fitbit.createSpO2Resource(file.id,data[i]));
            resourcePulse.push(fitbit.createPulseResource(file.id,data[i]));
          }
          console.log(resourceSpO2);
          console.log(resourcePulse);
        }
        else if(file.name == 'bpm.csv'){
          var data = await downloadFile(file.id,file.name, auth);
          var sys = [];
          var dia = [];
          var resourcePulse = [];
          for(let i=0; i<data.length; i++){
            sys.push(fitbit.createSysResource(file.id,data[i]));
            dia.push(fitbit.createDiaResource(file.id,data[i]));
            resourcePulse.push(fitbit.createPulseResource(file.id,data[i]));
          }
          console.log(sys);
          console.log(dia);
          console.log(resourcePulse);
        }

        else if(file.name == 'thermo.csv'){
          var data = await downloadFile(file.id,file.name, auth);
          var bodytemp = [];
          for(let i=0; i<data.length; i++){
            bodytemp.push(fitbit.createBodyTempResource(file.id,data[i]));
          }
          console.log(bodytemp);
        }
        else if(file.name == 'activity.csv'){
          var data = await downloadFile(file.id,file.name, auth);
          var calories = [];
          for(let i=0; i<data.length; i++){
            calories.push(fitbit.createCaloriesBurnedResource(file.id,data[i]));
          }
          console.log(calories);
        }

      });
    } else {
      console.log('No files found.');
    }
  });
}

async function downloadFile(realFileId, name, auth) {

  const drive = google.drive({version: 'v3', auth});

  fileId = realFileId;
  try {
    const file = await drive.files.get({
      fileId: fileId,
      alt: 'media',
    });
    var bufferString = file.data;
    var arr = bufferString.split('\n'); 
    var userObj=JSON.parse(JSON.stringify(bufferString));//data to add
    fs.appendFile(name, userObj, (err) => {
        if (err) console.error('Couldn\'t append the data');
        console.log('The data was appended to '+name+' file!');
    });
    // console.log(arr);
    var jsonObj = [];
    var headers = arr[0].split(',');
    var test = [];
    for(let i = 0; i <headers.length; i++){
      let some = headers[i].replace(/"/g, '');
      some = some.replace(/ /g, '_');
      some = some.replace(/\(/g, '');
      some = some.replace(/\)/g, '');
      some = some.replace(/\//g, '_');
      some = some.replace(/-/g, '_');
      some = some.replace(/\./g, '_');
      some = some.replace(/:/g, '_');
      test.push(some)
    }

    headers = test;
    for(var i = 1; i < arr.length-1; i++) {
      var data = arr[i].split(',');
      var obj = {};
      for(var j = 0; j < data.length; j++) {
        let some = data[j].replace(/"/g, '');
        obj[headers[j]] = some;
      }
      jsonObj.push(obj);
    }
    return jsonObj;
  } catch (err) {
    throw err;
  }
}

module.exports = processFitbit;
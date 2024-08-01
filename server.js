const axios = require('axios');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const PORT = process.env.PORT;
const API_KEY = process.env.NASA_API_KEY;
const IBM_ML_KEY = process.env.IBM_ML_KEY;

let inputData;
let dates;
const getAsteroidData = async (ID) => {
  const API_URL = `https://api.nasa.gov/neo/rest/v1/neo/${ID}?api_key=${API_KEY}`;
  try {
    const response = await axios.get(API_URL);
    const data = response.data;
    

    // Extract default fields
    const id = parseFloat(data.id);
    const name = data.name;
    const absoluteMagnitudeH = data.absolute_magnitude_h;
    const estimatedDiameterMin = data.estimated_diameter.kilometers.estimated_diameter_min;
    const estimatedDiameterMax = data.estimated_diameter.kilometers.estimated_diameter_max;
    const start = data.orbital_data.first_observation_date;
    const end = data.orbital_data.last_observation_date;

    // Select a random close approach data entry orbiting earth
    const closeApproachData = data.close_approach_data.filter(entry => entry.orbiting_body === 'Earth');
    if (closeApproachData.length === 0) throw new Error("No close approach data orbiting Earth found.");
    const randomIndex = Math.floor(Math.random() * closeApproachData.length);
    const selectedCloseApproachData = closeApproachData[0];
    
    const relativeVelocity = selectedCloseApproachData.relative_velocity.kilometers_per_hour;
    const missDistance = selectedCloseApproachData.miss_distance.kilometers;
    const orbitingBody = selectedCloseApproachData.orbiting_body;

    // Set the extracted data
    dates = [start,end]
    inputData = [
        parseFloat(absoluteMagnitudeH),
        parseFloat(estimatedDiameterMin),
        parseFloat(estimatedDiameterMax),
        orbitingBody,
        parseFloat(relativeVelocity),
        parseFloat(missDistance)
    ];

  } catch (error) {
    console.error('Error fetching data from NASA API:', error);
  }
};

app.post('/predict', async (req, res) => {
  try {
    const { ID, dataManual } = req.body;
    if (ID) await getAsteroidData(ID);
    else if (dataManual) inputData = dataManual;

    console.log(inputData);

    const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
    function getToken(errorCallback, loadCallback) {
    	const req = new XMLHttpRequest();
    	req.addEventListener("load", loadCallback);
    	req.addEventListener("error", errorCallback);
    	req.open("POST", "https://iam.cloud.ibm.com/identity/token");
    	req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    	req.setRequestHeader("Accept", "application/json");
    	req.send("grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=" + IBM_ML_KEY);
    }

    function apiPost(scoring_url, token, payload, loadCallback, errorCallback){
    	const oReq = new XMLHttpRequest();
    	oReq.addEventListener("load", loadCallback);
    	oReq.addEventListener("error", errorCallback);
    	oReq.open("POST", scoring_url);
    	oReq.setRequestHeader("Accept", "application/json");
    	oReq.setRequestHeader("Authorization", "Bearer " + token);
    	oReq.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    	oReq.send(payload);
    }

    getToken((err) => console.log(err), function () {
    	let tokenResponse;
    	try {
    		tokenResponse = JSON.parse(this.responseText);
    	} catch(ex) {
    		console.log(ex);
    	}
    	const cols = ["absolute_magnitude",
                    "estimated_diameter_min",
                    "estimated_diameter_max",
                    "orbiting_body",
                    "relative_velocity",
                    "miss_distance"];
      const payload = JSON.stringify({
        input_data: [{
          fields: cols,
          values: [inputData]
        }]
      });
    	const scoring_url = "https://us-south.ml.cloud.ibm.com/ml/v4/deployments/28a714a4-9ef8-492e-94ca-9a3c0ad470a5/predictions?version=2021-05-01";
    	apiPost(scoring_url, tokenResponse.access_token, payload, function (resp) {
    		let parsedPostResponse;
    		try {
    			parsedPostResponse = JSON.parse(this.responseText);
    		} catch (ex) {
    			console.error("Error parsing scoring response:", ex);
    		}
    		console.log("Scoring response", parsedPostResponse);
        if (parsedPostResponse.errors && parsedPostResponse.errors[0].code === 'instance_quota_exceeded'){
          console.log("Instance quota exceeded. Please try again later.");
          return res.json('CUH')
        }
        if (parsedPostResponse.errors && parsedPostResponse.errors[0].code === 'invalid_input_data'){
          console.log("invalid_input_data");
          return res.json('invalid')
        }
        else if (parsedPostResponse.predictions){
        const final = {
          output: parsedPostResponse.predictions[0].values[0][0],
          falsePredict: parsedPostResponse.predictions[0].values[0][1][0],
          truePredict: parsedPostResponse.predictions[0].values[0][1][1],
          startDate: dates ? dates[0] : '',
          endDate: dates ? dates[1] : ''
        };
        res.json(final);
      }
    	},
      function (error) {
    		console.log(error);
    	});
    }); 
    }  catch (err) {
      console.log(err);
    }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


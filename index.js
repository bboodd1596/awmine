const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
//app.use(cors({ origin: ['url Website use'] })); 
app.use(cors());
app.options('*', cors()); // all website use

// parse requests of content-type - application/json
app.use(bodyParser.json());
// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));


const atomicassets_account = "atomicassets";
const federation_account = "federation";
const mining_account = "m.federation";
const token_account = "alien.worlds";
const collection = "alien.worlds";
const endpoint = "https://wax.pink.gg";
const atomic_endpoint = ['https://wax.api.atomicassets.io', 'https://wax3.api.atomicassets.io'];
const { Api, JsonRpc, RpcError, Serialize } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');      // development only
const fetch = require('node-fetch');                                    // node only; not needed in browsers
const { ExplorerApi, RpcApi } = require("atomicassets");
const eos_rpc = new JsonRpc(endpoint, { fetch });
const aa_api = new ExplorerApi(atomic_endpoint[0], atomicassets_account, {
    fetch,
    rateLimit: 4,
});

const { TextDecoder, TextEncoder } = require(/*! text-encoding */ "text-encoding");
const Int64LE = require(/*! int64-buffer */ "int64-buffer").Int64LE;
const crypto = require("crypto");
const Buffer = require('buffer').Buffer  // note: the trailing slash is important!
const Blob = require('blob');
const http = require('http');

http.createServer(app).listen(process.env.PORT);



app.get('/', (req, res) => {
    res.json({ account: "Hello World" })  // <==== req.body will be a parsed JSON object
})

app.post('/workers', async (req, res) => {
    const { account } = req.body
	const mine_work = await background_mine(account);
	res.json(mine_work)
    // res.json({account: account})  // <==== req.body will be a parsed JSON object
})

app.post('/waxtoarr', async (req, res) => {
    const { account } = req.body
	const sb = new Serialize.SerialBuffer({
        textEncoder: new TextEncoder,
        textDecoder: new TextDecoder
    });

    sb.pushName(account);
	
	let sba = sb.array.slice(0, 8);
	let stringCheck = "";
	for(i = 0; i < sba.length; i++) {
		stringCheck += sba[i] + ",";
	}
	stringCheck = stringCheck.substring(0, stringCheck.length -1);
	console.log(`account:${account} WaxArray:${stringCheck}`)
	res.json({account: stringCheck})
})

app.post('/getdiff', async (req, res) => {
    const { account } = req.body
	const mine_work = await getMineDelay(account);
	res.json(mine_work)
    // res.json({account: account})  // <==== req.body will be a parsed JSON object
})


const getMineDelay = async function (account) {
    try {
        const LandData = await getLand(federation_account, mining_account, account, eos_rpc, aa_api)
		const BagData = await getBag(mining_account, account, eos_rpc, aa_api)
        const params = getBagMiningParams(BagData);
        const land_params = getLandMiningParams(LandData);
        params.delay *= land_params.delay / 10;
        params.difficulty += land_params.difficulty;
        return land_params;
    } catch (error) {
        return '4444';
    }
};



/* Utility functions */
const getRand = () => {
    const arr = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
        const rand = parseInt(Math.floor(Math.random() * 255));
        arr[i] = rand;
    }
    return arr;
};

const pushRand = (sb) => {
    const arr = getRand();
    sb.pushArray(arr);
    return arr;
};


/* uint8array to / from hex strings */
const fromHexString = hexString =>
    new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

const toHexString = bytes =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');

const nameToArray = (name) => {
    const sb = new Serialize.SerialBuffer({
        textEncoder: new TextEncoder,
        textDecoder: new TextDecoder
    });

    sb.pushName(name);

    return sb.array;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// Calculate Nonce 

const background_mine = async (accountS) => {
	var str = accountS;
	const res = str.split(",");
	const account = res[0];
	const difficulty = res[1];
	const last_mine_tx = res[2];
	const MineWork = setHash({ mining_account, account, difficulty, last_mine_tx });
    return MineWork;
};

const setHash = async (mining_params) => {
    mining_params.last_mine_tx = mining_params.last_mine_tx.substr(0, 16); // only first 8 bytes of txid
    mining_params.last_mine_arr = fromHexString(mining_params.last_mine_tx);

    const sb = new Serialize.SerialBuffer({
        textEncoder: new TextEncoder,
        textDecoder: new TextDecoder
    });
    mining_params.sb = sb;

    mining_params.account_str = mining_params.account;
    mining_params.account = nameToArray(mining_params.account);
    const getRand = () => {
        const arr = new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
            const rand = Math.floor(Math.random() * 255);
            arr[i] = rand;
        }
        return arr;
    };
    const toHex = (buffer) => {
        return [...new Uint8Array(buffer)]
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    };
    mining_params.account = mining_params.account.slice(0, 8);
    const is_wam = mining_params.account_str.substr(-4) === '.wam';
    let good = false, itr = 0, rand = 0, hash, hex_digest, rand_arr, last;
    const start = (new Date()).getTime();

    while (!good) {
        rand_arr = getRand();
        const combined = new Uint8Array(mining_params.account.length + mining_params.last_mine_arr.length + rand_arr.length);
        combined.set(mining_params.account);
        combined.set(mining_params.last_mine_arr, mining_params.account.length);
        combined.set(rand_arr, mining_params.account.length + mining_params.last_mine_arr.length);
        hash = crypto.createHash("sha256");
        hash.update(combined.slice(0, 24));
        hex_digest = hash.digest('hex');
        if (is_wam) {
            good = hex_digest.substr(0, 4) === '0000';
        }
        else {
            good = hex_digest.substr(0, 6) === '000000';
        }

        if (good) {
            if (is_wam) {
                last = parseInt(hex_digest.substr(4, 1), 16);
            }
            else {
                last = parseInt(hex_digest.substr(6, 1), 16);
            }
            good &= (last <= mining_params.difficulty);
        }
        itr++;

        /*if (itr % 1000000 === 0) {
            console.log(`Still mining - tried ${itr} iterations`);
            const mine_work = { account: mining_params.account_str, rand_str: "0", hex_digest: "0" };
            return mine_work;
        }*/	
		
		if (itr % 1000000 === 0) {
            console.log(`account:${mining_params.account_str} - tried ${itr}`);
            const mine_work = { account: mining_params.account_str, rand_str: "0", hex_digest: "0" };
            return mine_work;
        }				
		
        if (!good) {
            hash = null;
        }
    }
    const end = (new Date()).getTime();
    const rand_str = toHex(rand_arr);
    console.log(`account:${mining_params.account_str} Hash:${rand_str} taking ${(end - start) / 1000}s`)
    const mine_work = { account: mining_params.account_str, rand_str, hex_digest };
	return mine_work;
};


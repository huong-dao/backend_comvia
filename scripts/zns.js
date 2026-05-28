'use strict';
const axios = require('axios');
const crypto = require("crypto");
const utils = require('./../helper/util');
const redis = require('./../helper/redis');

// zns
const appID = "4467726254333837718";
const secretkey_2 = "7H2tLUN3q9666ru14N5j";

/*
Author: TaiTran
*/
const getAccessToken = async (data) => {
    return  await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        new URLSearchParams({
            'code': data.auth_code,
            'app_id': appID,
            'grant_type': 'authorization_code',
            'code_verifier': data.code_verifier
        }),
        {
            headers: {
                'secret_key': secretkey_2
            }
        }
    );
};

const getAccessTokenByRefreshToken = async (data) => {
    return  await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        new URLSearchParams({
            'refresh_token': data.refresh_token,
            'app_id': appID,
            'grant_type': 'refresh_token'
        }),
        {
            headers: {
                'secret_key': secretkey_2
            }
        }
    );

};

const justSend = async (data) => {
    // check exist access_token
    const access_token = await redis.get('zalo-access-token-' + data.zalo_oa_id);
    if(access_token){
        // send message
        return  sendMessage({
            phone_number: data.phone_number,
            template_id: data.template_id,
            template_data: data.template_data,
            access_token: access_token
        });
    } else {
        const refresh_token = await redis.get('zalo-refresh-token-' + data.zalo_oa_id);
        if(refresh_token){
            // get new access token by refresh token
            const refresh_token = await redis.get('zalo-refresh-token-' + data.zalo_oa_id);
            const result = await getAccessTokenByRefreshToken({
                refresh_token: refresh_token
            });
            redis.set('zalo-access-token-' + data.zalo_oa_id, result.data.access_token, 60*60*24); // 24h
            redis.set('zalo-refresh-token-' + data.zalo_oa_id, result.data.refresh_token, 60*60*24*29); // 29 ngày

            // send message
            return sendMessage({
                phone_number: data.phone_number,
                template_id: data.template_id,
                template_data: data.template_data,
                access_token: result.data.access_token
            });
        }
    }
};

const send = async (data, res) => {
    // check exist access_token
    const access_token = await redis.get('zalo-access-token-' + data.zalo_oa_id);
    if(access_token){
        // send message
        return  sendMessage({
            phone_number: data.phone_number,
            template_id: data.template_id,
            template_data: data.template_data,
            access_token: access_token
        });
    } else {
        const refresh_token = await redis.get('zalo-refresh-token-' + data.zalo_oa_id);
        if(refresh_token){
            // get new access token by refresh token
            const refresh_token = await redis.get('zalo-refresh-token-' + data.zalo_oa_id);
            const result = await getAccessTokenByRefreshToken({
                refresh_token: refresh_token
            });
            redis.set('zalo-access-token-' + data.zalo_oa_id, result.data.access_token, 60*60*24); // 24h
            redis.set('zalo-refresh-token-' + data.zalo_oa_id, result.data.refresh_token, 60*60*24*29); // 29 ngày

            // send message
            return sendMessage({
                phone_number: data.phone_number,
                template_id: data.template_id,
                template_data: data.template_data,
                access_token: result.data.access_token
            });
        } else {
            //
            const state = makeid(8);
            redis.set('zalo-access-state-' + data.zalo_oa_id, state, 60*60); // 1h

            // get code
            const code_verifier = makeid(43);
            let hash = crypto.createHash('sha256');
            let _data = hash.update(code_verifier, 'utf-8');
            let code_challenge = _data.digest('base64').replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
            redis.set('zalo-code-verifier-' + data.zalo_oa_id, code_verifier, 60*60);
            res.redirect('https://oauth.zaloapp.com/v4/oa/permission?app_id=4467726254333837718&redirect_uri=https%3A%2F%2Fid.onweb.asia%2Fv1%2Fzalo%2Fauth%2Fcall-back&code_challenge=' + code_challenge + '&state=' + state);
        }
    }
};

const setPermission = async (data, res) => {
    const state = makeid(8);
    redis.set('zalo-access-state-' + data.zalo_oa_id, state, 60*60); // 1h

    // get code
    const code_verifier = makeid(43);
    let hash = crypto.createHash('sha256');
    let _data = hash.update(code_verifier, 'utf-8');
    let code_challenge = _data.digest('base64').replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    redis.set('zalo-code-verifier-' + data.zalo_oa_id, code_verifier, 60*60);
    
    //res.redirect('https://oauth.zaloapp.com/v4/oa/permission?app_id=4467726254333837718&redirect_uri=https%3A%2F%2Fid.onweb.asia%2Fv1%2Fzalo%2Fauth%2Fcall-back&code_challenge=' + code_challenge + '&state=' + state);
    res.redirect('https://oauth.zaloapp.com/v4/oa/permission?app_id=4467726254333837718&redirect_uri=https%3A%2F%2Fid.onweb.asia%2Fv1%2Fzalo%2Fauth%2Fcall-back');
};

const makeid = (length) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
};

const sendMessage = async (data) => {
    return axios.post('https://business.openapi.zalo.me/message/template',{
        "phone": data.phone_number, // 84977234664
        "template_id": data.template_id,
        "template_data": data.template_data,
        "tracking_id": "send_invoice",
    }, {
        headers: {
            'access_token': data.access_token,
            'Content-Type': 'application/json'
        }
    });
};

module.exports = {
    justSend,
    send,
    getAccessToken,
    setPermission
};
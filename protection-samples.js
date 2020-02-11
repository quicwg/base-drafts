#!/bin/sh
':' //; exec "$(command -v nodejs || command -v node)" "$0" "$@"

// This script performs simple encryption and decryption for Initial packets.
// It's crude, but it should be sufficient to generate examples.


'use strict';
var buffer = require('buffer');
var crypto = require('crypto');
var assert = require('assert');

var INITIAL_SALT = Buffer.from('c3eef712c72ebb5a11a7d2432bb46365bef9f502', 'hex');
var SHA256 = 'sha256';
var AES_GCM = 'aes-128-gcm';
var AES_ECB = 'aes-128-ecb';

var version = 'ff000019';

function log(m, k) {
  console.log(m + ' [' + k.length + ']: ' + k.toString('hex'));
};

class HMAC {
  constructor(hash) {
    this.hash = hash;
  }

  digest(key, input) {
    var hmac = crypto.createHmac(this.hash, key);
    hmac.update(input);
    return hmac.digest();
  }
}

/* HKDF as defined in RFC5869, with HKDF-Expand-Label from RFC8446. */
class QHKDF {
  constructor(hmac, prk) {
    this.hmac = hmac;
    this.prk = prk;
  }

  static extract(hash, salt, ikm) {
    var hmac = new HMAC(hash);
    return new QHKDF(hmac, hmac.digest(salt, ikm));
  }

  expand(info, len) {
    var output = Buffer.alloc(0);
    var T = Buffer.alloc(0);
    info = Buffer.from(info, 'ascii');
    var counter = 0;
    var cbuf = Buffer.alloc(1);
    while (output.length < len) {
      cbuf.writeUIntBE(++counter, 0, 1);
      T = this.hmac.digest(this.prk, Buffer.concat([T, info, cbuf]));
      output = Buffer.concat([output, T]);
    }

    return output.slice(0, len);
  }

  expand_label(label, len) {
    const prefix = "tls13 ";
    var info = Buffer.alloc(2 + 1 + prefix.length + label.length + 1);
    // Note that Buffer.write returns the number of bytes written, whereas
    // Buffer.writeUIntBE returns the end offset of the write.  Consistency FTW.
    var offset = info.writeUIntBE(len, 0, 2);
    offset = info.writeUIntBE(prefix.length + label.length, offset, 1);
    offset += info.write(prefix + label, offset);
    info.writeUIntBE(0, offset, 1);
    log('info for ' + label, info);
    return this.expand(info, len);
  }
}

class InitialProtection {
  constructor(label, cid) {
    var qhkdf = QHKDF.extract(SHA256, INITIAL_SALT, cid);
    log('initial_secret', qhkdf.prk);
    qhkdf = new QHKDF(qhkdf.hmac, qhkdf.expand_label(label, 32));
    log(label + ' secret', qhkdf.prk);
    this.key = qhkdf.expand_label("quic key", 16);
    log(label + ' key', this.key);
    this.iv = qhkdf.expand_label("quic iv", 12);
    log(label + ' iv', this.iv);
    this.hp = qhkdf.expand_label("quic hp", 16);
    log(label + ' hp', this.hp);
  }

  generateNonce(counter) {
    var nonce = Buffer.from(this.iv);
    var m = nonce.readUIntBE(nonce.length - 6, 6);
    var x = ((m ^ counter) & 0xffffff) +
        ((((m / 0x1000000) ^ (counter / 0x1000000)) & 0xffffff) * 0x1000000);
    nonce.writeUIntBE(x, nonce.length - 6, 6);
    return nonce;
  }

  // Returns the encrypted data with authentication tag appended.  The AAD is
  // used, but not added to the output.
  encipher(pn, aad, data) {
    console.log('encipher pn', pn);
    log('encipher aad', aad);
    log('encipher data', data);
    var nonce = this.generateNonce(pn);
    var gcm = crypto.createCipheriv(AES_GCM, this.key, nonce);
    gcm.setAAD(aad);
    var e = gcm.update(data);
    gcm.final();
    e = Buffer.concat([e, gcm.getAuthTag()]);
    log('enciphered', e);
    return e;
  }

  decipher(pn, aad, data) {
    console.log('decipher pn', pn);
    log('decipher aad', aad);
    log('decipher data', data);
    var nonce = this.generateNonce(pn);
    var gcm = crypto.createDecipheriv(AES_GCM, this.key, nonce);
    gcm.setAAD(aad);
    gcm.setAuthTag(data.slice(data.length - 16));
    var d = gcm.update(data.slice(0, data.length - 16));
    gcm.final();
    log('deciphered', d);
    return d;
  }

  // Calculates the header protection mask.  Returns 16 bytes of output.
  hpMask(sample) {
    log('hp sample', sample);
    // var ctr = crypto.createCipheriv('aes-128-ctr', this.hp, sample);
    // var mask = ctr.update(Buffer.alloc(5));
    var ecb = crypto.createCipheriv('aes-128-ecb', this.hp, Buffer.alloc(0));
    var mask = ecb.update(sample);
    log('hp mask', mask);
    return mask;
  }

  // XOR b into a.
  xor(a, b) {
    a.forEach((_, i) => {
      a[i] ^= b[i];
    });
  }

  // hdr is everything before the length field
  // hdr[0] has the packet number length already in place
  // pn is the packet number
  // data is the payload (i.e., encoded frames)
  encrypt(hdr, pn, data) {
    var pn_len = 1 + (hdr[0] & 0x3);
    if (pn_len + data.length < 4) {
      throw new Error('insufficient length of packet number and payload');
    }

    var aad = Buffer.alloc(hdr.length + 2 + pn_len);
    var offset = hdr.copy(aad);
    // Add a length that covers the packet number encoding and the auth tag.
    offset = aad.writeUIntBE(0x4000 | (pn_len + data.length + 16), offset, 2);
    var pn_offset = offset;
    var pn_mask = 0xffffffff >> (8 * (4 - pn_len));
    offset = aad.writeUIntBE(pn & pn_mask, offset, pn_len)
    log('header', aad);

    var payload = this.encipher(pn, aad, data);

    var mask = this.hpMask(payload.slice(4 - pn_len, 20 - pn_len));
    aad[0] ^= mask[0] & (0x1f >> (aad[0] >> 7));
    this.xor(aad.slice(pn_offset), mask.slice(1));
    log('masked header', aad);
    return Buffer.concat([aad, payload]);
  }

  cidLen(v) {
    if (!v) {
      return 0;
    }
    return v + 3;
  }

  decrypt(data) {
    log('decrypt', data);
    if (data[0] & 0x40 !== 0x40) {
      throw new Error('missing QUIC bit');
    }
    if (data[0] & 0x80 === 0) {
      throw new Error('short header unsupported');
    }
    var hdr_len = 1 + 4;
    hdr_len += 1 + data[hdr_len]; // DCID
    hdr_len += 1 + data[hdr_len]; // SCID
    if ((data[0] & 0x30) === 0) { // Initial packet: token.
      if ((data[hdr_len] & 0xc0) !== 0) {
        throw new Error('multi-byte token length unsupported');
      }
      hdr_len += 1 + data[hdr_len];  // oops: this only handles single octet lengths.
    }
    // Skip the length.
    hdr_len += 1 << (data[hdr_len] >> 6);
    // Now we're at the encrypted bit.
    var mask = this.hpMask(data.slice(hdr_len + 4, hdr_len + 20));

    var octet0 = data[0] ^ (mask[0] & (0x1f >> (data[0] >> 7)));
    var pn_len = (octet0 & 3) + 1;
    var hdr = Buffer.from(data.slice(0, hdr_len + pn_len));
    hdr[0] = octet0;
    log('header', hdr);
    this.xor(hdr.slice(hdr_len), mask.slice(1));
    log('unmasked header', hdr);
    var pn = hdr.readUIntBE(hdr_len, pn_len);
    // Important: this doesn't recover PN based on expected value.
    // The expectation being that Initial packets won't ever need that.
    return this.decipher(pn, hdr, data.slice(hdr.length));
  }
}

function pad(hdr, body) {
  var pn_len = (hdr[0] & 3) + 1;
  var size = 1200 - hdr.length - 2 - pn_len - 16; // Assume 2 byte length.
  if (size < 0) {
    return body;
  }
  var padded = Buffer.allocUnsafe(size);
  console.log('pad amount', size);
  body.copy(padded);
  padded.fill(0, body.length);
  log('padded', padded);
  return padded;
}

function test(role, cid, hdr, pn, body) {
  cid = Buffer.from(cid, 'hex');
  log('connection ID', cid);
  hdr = Buffer.from(hdr, 'hex');
  log('header', hdr);
  console.log('packet number = ' + pn);
  body = Buffer.from(body, 'hex');
  log('body', hdr);

  if (role === 'client' && (hdr[0] & 0x30) === 0) {
    body = pad(hdr, body);
  }

  var endpoint = new InitialProtection(role + ' in', cid);
  var packet = endpoint.encrypt(hdr, pn, body);
  log('encrypted packet', packet);

  var content = endpoint.decrypt(packet);
  log('decrypted content', content);
  if (content.compare(body) !== 0) {
    throw new Error('decrypted result not the same as the original');
  }
}

function hex_cid(cid) {
  return '0' + (cid.length / 2).toString(16) + cid;
}

function retry(dcid, scid, odcid) {
  var pfx = Buffer.from(hex_cid(odcid), 'hex');
  var encoded = Buffer.from('ff' + version + hex_cid(dcid) + hex_cid(scid), 'hex');
  var token = Buffer.from('token', 'ascii');
  var header = Buffer.concat([encoded, token]);
  log('retry header', header);
  var aad = Buffer.concat([pfx, header]);
  log('retry aad', aad);

  var key = Buffer.from('4d32ecdb2a2133c841e4043df27d4430', 'hex');
  var nonce = Buffer.from('4d1611d05513a552c587d575', 'hex');

  var gcm = crypto.createCipheriv(AES_GCM, key, nonce);
  gcm.setAAD(aad);
  gcm.update('');
  gcm.final();
  log('retry', Buffer.concat([header, gcm.getAuthTag()]));
}

var cid = '8394c8f03e515708';

var ci_hdr = 'c3' + version + hex_cid(cid) + '0000';
// This is a client Initial.  Unfortunately, the ClientHello currently omits
// the transport_parameters extension.
var crypto_frame = '060040c4' +
    '010000c003036660261ff947cea49cce6cfad687f457cf1b14531ba14131a0e8' +
    'f309a1d0b9c4000006130113031302010000910000000b000900000673657276' +
    '6572ff01000100000a00140012001d0017001800190100010101020103010400' +
    '230000003300260024001d00204cfdfcd178b784bf328cae793b136f2aedce00' +
    '5ff183d7bb1495207236647037002b0003020304000d0020001e040305030603' +
    '020308040805080604010501060102010402050206020202002d00020101001c' +
    '00024001';
test('client', cid, ci_hdr, 2, crypto_frame);

// This should be a valid server Initial.
var frames = '0d0000000018410a' +
    '020000560303eefce7f7b37ba1d163' +
    '2e96677825ddf73988cfc79825df566dc5430b9a04' +
    '5a1200130100002e00330024001d00209d3c940d89' +
    '690b84d08a60993c144eca684d1081287c834d5311' +
    'bcf32bb9da1a002b00020304';
var scid = 'f067a5502a4262b5';
var si_hdr = 'c1' + version + '00' + hex_cid(scid) + '00';
test('server', cid, si_hdr, 1, frames);

retry('', scid, cid);

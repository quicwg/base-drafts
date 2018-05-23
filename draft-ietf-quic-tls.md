---
title: Using Transport Layer Security (TLS) to Secure QUIC
abbrev: QUIC over TLS
docname: draft-ietf-quic-tls-latest
date: {DATE}
category: std
ipr: trust200902
area: Transport
workgroup: QUIC

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
  -
    ins: M. Thomson
    name: Martin Thomson
    org: Mozilla
    email: martin.thomson@gmail.com
    role: editor
  -
    ins: S. Turner
    name: Sean Turner
    org: sn3rd
    email: sean@sn3rd.com
    role: editor

normative:

  QUIC-TRANSPORT:
    title: "QUIC: A UDP-Based Multiplexed and Secure Transport"
    date: {DATE}
    seriesinfo:
      Internet-Draft: draft-ietf-quic-transport-latest
    author:
      -
        ins: J. Iyengar
        name: Jana Iyengar
        org: Fastly
        role: editor
      -
        ins: M. Thomson
        name: Martin Thomson
        org: Mozilla
        role: editor

informative:

  AEBounds:
    title: "Limits on Authenticated Encryption Use in TLS"
    author:
      - ins: A. Luykx
      - ins: K. Paterson
    date: 2016-03-08
    target: "http://www.isg.rhul.ac.uk/~kp/TLS-AEbounds.pdf"

  IMC:
    title: "Introduction to Modern Cryptography, Second Edition"
    author:
      - ins: J. Katz
      - ins: Y. Lindell
    date: 2014-11-06
    seriesinfo:
      ISBN: 978-1466570269

  QUIC-HTTP:
    title: "Hypertext Transfer Protocol (HTTP) over QUIC"
    date: {DATE}
    seriesinfo:
      Internet-Draft: draft-ietf-quic-http-latest
    author:
      -
        ins: M. Bishop
        name: Mike Bishop
        org: Microsoft
        role: editor

  QUIC-RECOVERY:
    title: "QUIC Loss Detection and Congestion Control"
    date: {DATE}
    seriesinfo:
      Internet-Draft: draft-ietf-quic-recovery-latest
    author:
      -
        ins: J. Iyengar
        name: Jana Iyengar
        org: Fastly
        role: editor
      -
        ins: I. Swett
        name: Ian Swett
        org: Google
        role: editor


--- abstract

This document describes how Transport Layer Security (TLS) is used to secure
QUIC.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/-tls>.

--- middle

# Introduction


This document describes how QUIC {{QUIC-TRANSPORT}} is secured using
Transport Layer Security (TLS) version 1.3 {{!TLS13=I-D.ietf-tls-tls13}}.  TLS
1.3 provides critical latency improvements for connection establishment
over previous versions.  Absent packet loss, most new connections can be
established and secured within a single round trip; on subsequent
connections between the same client and server, the client can often
send application data immediately, that is, using a zero round trip
setup.

This document describes how the standardized TLS 1.3 acts as a security
component of QUIC.


# Notational Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in BCP 14 {{!RFC2119}} {{!RFC8174}}
when, and only when, they appear in all capitals, as shown here.

This document uses the terminology established in {{QUIC-TRANSPORT}}.

For brevity, the acronym TLS is used to refer to TLS 1.3.


## TLS Overview

TLS provides two endpoints with a way to establish a means of communication over
an untrusted medium (that is, the Internet) that ensures that messages they
exchange cannot be observed, modified, or forged.

Internally, TLS is a layered protocol, with the structure shown below:

~~~~
+--------------+--------------+--------------+
|  Handshake   |    Alerts    |  Application |
|    Layer     |              |     Data     |
|              |              |              |
+--------------+--------------+--------------+
|                                            |
|               Record Layer                 |
|                                            |
+--------------------------------------------+
~~~~

Each upper layer (handshake, alerts, and application data) is carried as
a series of typed TLS records. Records are individually cryptographically
protected and then transmitted over a reliable transport (typically TCP)
which provides sequencing and guaranteed delivery.

The TLS authenticated key exchange occurs between two entities: client and
server.  The client initiates the exchange and the server responds.  If the key
exchange completes successfully, both client and server will agree on a secret.
TLS supports both pre-shared key (PSK) and Diffie-Hellman (DH) key exchanges.
PSK is the basis for 0-RTT; the latter provides perfect forward secrecy (PFS)
when the DH keys are destroyed.

After completing the TLS handshake, the client will have learned and
authenticated an identity for the server and the server is optionally able to
learn and authenticate an identity for the client.  TLS supports X.509
{{?RFC5280}} certificate-based authentication for both server and client.

The TLS key exchange is resistent to tampering by attackers and it produces
shared secrets that cannot be controlled by either participating peer.

TLS 1.3 provides two basic handshake modes of interest to QUIC:

 * A full 1-RTT handshake in which the client is able to send application data
   after one round trip and the server immediately responds after receiving the
   first handshake message from the client.

 * A 0-RTT handshake in which the client uses information it has previously
   learned about the server to send application data immediately.  This
   application data can be replayed by an attacker so it MUST NOT carry a
   self-contained trigger for any non-idempotent action.

A simplified TLS 1.3 handshake with 0-RTT application data is shown in
{{tls-full}}, see {{!TLS13}} for more options and details.

~~~
    Client                                             Server

    ClientHello
   (0-RTT Application Data)  -------->
                                                  ServerHello
                                         {EncryptedExtensions}
                                                    {Finished}
                             <--------      [Application Data]
   (EndOfEarlyData)
   {Finished}                -------->

   [Application Data]        <------->      [Application Data]

    () Indicates messages protected by early data (0-RTT) keys
    {} Indicates messages protected using handshake keys
    [] Indicates messages protected using application data
       (1-RTT) keys
~~~
{: #tls-full title="TLS Handshake with 0-RTT"}

Data is protected using a number of encryption levels:

- Plaintext
- Early Data (0-RTT) Keys
- Handshake Keys
- Application Data (1-RTT) Keys

Application data may appear only in the early data and application
data levels. Handshake and Alert messages may appear in any level.

The 0-RTT handshake is only possible if the client and server have previously
communicated.  In the 1-RTT handshake, the client is unable to send protected
application data until it has received all of the handshake messages sent by the
server.


# Protocol Overview

QUIC {{QUIC-TRANSPORT}} assumes responsibility for the confidentiality and
integrity protection of packets.  For this it uses keys derived from a TLS 1.3
handshake {{!TLS13}}, but instead of carrying TLS records over QUIC
(as with TCP), TLS Handshake and Alert messages are carried directly
over QUIC transport, which takes over the responsibilities of the TLS
record layer, as shown below.

~~~~

+--------------+--------------+ +-------------+
|     TLS      |     TLS      | |    QUIC     |
|  Handshake   |    Alerts    | | Applications|
|              |              | | (h2q, etc.) |
+--------------+--------------+-+-------------+
|                                             |
|                QUIC Transport               |
|   (streams, reliability, congestion, etc.)  |
|                                             |
+---------------------------------------------+
|                                             |
|            QUIC Packet Protection           |
|                                             |
+---------------------------------------------+
~~~~


QUIC also relies on TLS 1.3 for authentication and
negotiation of parameters that are critical to security and performance.

Rather than a strict layering, these two protocols are co-dependent: QUIC uses
the TLS handshake; TLS uses the reliability and ordered delivery provided by
QUIC streams.

At a high level, there are two main interactions between the TLS and QUIC
components:

* The TLS component sends and receives messages via the QUIC component, with
  QUIC providing a reliable stream abstraction to TLS.

* The TLS component provides a series of updates to the QUIC
  component, including (a) new packet protection keys to install (b)
  state changes such as handshake completion, the server certificate,
  etc.

{{schematic}} shows these interactions in more detail, with the QUIC
packet protection being called out specially.

~~~
+------------+                        +------------+
|            |<- Handshake Messages ->|            |
|            |<---- 0-RTT Keys -------|            |
|            |<--- Handshake Keys-----|            |
|   QUIC     |<---- 1-RTT Keys -------|    TLS     |
|            |<--- Handshake Done ----|            |
+------------+                        +------------+
 |         ^
 | Protect | Protected
 v         | Packet
+------------+
|   QUIC     |
|  Packet    |
| Protection |
+------------+
~~~
{: #schematic title="QUIC and TLS Interactions"}

Unlike TLS over TCP, QUIC applications which want to send data do not
send it through TLS "application_data" records. Rather, they send it
as QUIC STREAM frames which are then carried in QUIC packets.


# Carrying TLS Messages {#carrying-tls}

QUIC carries TLS handshake data in CRYPTO_HS frames, each of which
consists of a contiguous block of handshake data (identified by an
offset and length). Those frames are packaged into QUIC packets
and encrypted under the current TLS encryption level.
As with TLS over TCP, once TLS handshake data has
been delivered to QUIC, it is QUIC's responsibility to deliver it
reliably. Each chunk of data is associated with the then-current TLS
sending keys, and if QUIC needs to retransmit that data, it MUST use
the same keys even if TLS has already updated to newer keys.

One important difference between TLS 1.3 records (used with TCP)
and QUIC CRYPTO_HS frames is that in QUIC multiple frames may appear
in the same QUIC packet as long as they are associated with the
same encryption level. For instance, an implementation might
bundle a Handshake message and an ACK for some Handshake
data into the same packet.

In general, the rules for which data can appear in packets of which
encryption level are the same in QUIC as in TLS over TCP:

- CRYPTO_HS frames MAY appear in packets of any encryption level.
- CONNECTION_CLOSE and CRYPTO_CLOSE MAY appear in packets of any
  encryption level other than 0-RTT.
- PADDING and PING frames MAY appear in packets of any encryption level.
- ACK frames MAY appear in packets of any encryption level, but
  MUST only acknowledge packets which appeared in that encryption
  level.
- STREAM frames MUST ONLY appear in the 0-RTT and 1-RTT levels.
- All other frame types MUST only appear at the 1-RTT levels.

Because packets may be reordered on the wire, QUIC uses the packet
type to indicate which level a given packet was encrypted
under [TODO: Table needed here?]. When multiple packets of
different encryption levels need to be sent, endpoints SHOULD use
compound packets to send them in the same UDP datagram.


## Handshake and Setup Sequence

The integration of QUIC with a TLS handshake is shown in more detail in
{{quic-tls-handshake}}.

~~~
Client                                                   Server

<CRYPTO_HS[
        ClientHello]>  --------->

(STREAM[0-RTTData])    --------->

                       <---------   <ACK,
                                        CRYPTO_HS[ServerHello]>

                       <---------  {CRYPTO_HS[
                                           EncryptedExtensions,
                                                   Certificate,
                                             CertificateVerify,
                                                     Finished]}

                      <---------         {STREAM[0.5-RTT Data])
{ACK,
 CRYPTO_HS[Finished]} --------->

[Any frames]          <-------->                   [Any frames]

~~~
{: #quic-tls-handshake title="QUIC Handshake"}

In {{quic-tls-handshake}}, symbols mean:

* "<" and ">" enclose packets protected with Initial keys {{initial-secrets}}.

* "(" and ")" enclose packets that are protected with 0-RTT handshake or
  application keys.

* "{" and "}" enclose packets that are protected by the Handshake keys.

* "[" and "]" enclose packets that are protected by the Application keys.

* CRYPTO_HS[...], STREAM[...] and ACK indicate QUIC frames.

If 0-RTT is not attempted, then the client does not send packets protected by
the 0-RTT key.


## Interface to TLS

As shown in {{schematic}}, the interface from QUIC to TLS consists of three
primary functions:

- Sending and receiving handshake messages
- Rekeying (both in and out)
- Handshake state updates

Additional functions might be needed to configure TLS.


### Sending and Receiving Handshake Messages

In order to drive the handshake, TLS depends on being able to send and receive
handshake messages. There are two basic functions on this
interface: one where QUIC requests handshake messages and one where QUIC
provides handshake packets.

Before starting the handshake QUIC provides TLS with the transport parameters
(see {{quic_parameters}}) that it wishes to carry.

A QUIC client starts TLS by requesting TLS handshake octets from
TLS.  The client acquires handshake octets before sending its first packet.
A QUIC server starts the process by providing TLS with the client's
handshake octets.

At any given time, an endpoint will have a current sending encryption
level and receiving encryption level. Each encryption level is
associated with a different flow of bytes, which is reliably
transmitted to the peer in CRYPTO_HS frames. When TLS provides handshake
octets to be sent, they are appended to the current flow and
will eventually be transmitted under the then-current key.

When an endpoint receives a packet containing a CRYPTO_HS frame from
the network, it proceeds as follows:

- If the packet was in the current receiving encryption level, sequence
  the data into the input flow as usual. As with STREAM frames,
  the offset is used to find the proper location in the data sequence.
  If the result of this process is that new data is available, then
  it is delivered to TLS.

- If the packet is from a previously installed encryption level, it
  MUST not contain data which extends past the end of previously
  received data in that flow. [TODO(ekr): Double check that this
  can't happen]. Implementations MUST treat any violations of this
  requirement as a connection error of type PROTOCOL_VIOLATION.

Each time that TLS is provided with new data, new handshake octets are
requested from TLS.  TLS might not provide any octets if the handshake
messages it has received are incomplete or it has no data to send.

Once the TLS handshake is complete, this is indicated to QUIC along with any
final handshake octets that TLS needs to send.  TLS also provides QUIC with the
transport parameters that the peer advertised during the handshake.

Once the handshake is complete, TLS becomes passive.  TLS can still receive data
from its peer and respond in kind, but it will not need to send more data unless
specifically requested - either by an application or QUIC.  One reason to send
data is that the server might wish to provide additional or updated session
tickets to a client.

When the handshake is complete, QUIC only needs to provide TLS with any data
that arrives in CRYPTO_HS streams.  In the same way that is done during the
handshake, new data is requested from TLS after providing received data.

Important:

: Until the handshake is reported as complete, the connection and key exchange
  are not properly authenticated at the server.  Even though 1-RTT keys are
  available to a server after receiving the first handshake messages from a
  client, the server cannot consider the client to be authenticated until it
  receives and validates the client's Finished message.

: The requirement for the server to wait for the client Finished message creates
  a dependency on that message being delivered.  A client can avoid the
  potential for head-of-line blocking that this implies by sending a copy of the
  STREAM frame that carries the Finished message in multiple packets.  This
  enables immediate server processing for those packets.

### Encryption Level Changes

At each change of encryption level in either direction, TLS signals
QUIC, providing the new level and the encryption keys.
These events are not asynchronous, they always occur immediately after TLS is
provided with new handshake octets, or after TLS produces handshake octets.

If 0-RTT is possible, it is ready after the client sends a TLS ClientHello
message or the server receives that message.  After providing a QUIC client with
the first handshake octets, the TLS stack might signal the change to the
the 0-RTT keys. On the server, after receiving handshake octets that contain a
ClientHello message, a TLS server might signal that 0-RTT keys are available.

Note that although TLS only uses one encryption level at a time, QUIC
may use more than one level. For instance, after sending its Finished
message (using a CRYPTO_HS frame in Handshake encryption) may send STREAM
data (in 1-RTT encryption). However, if the Finished is lost, the client
would have to retransmit the Finished, in which case it would use
Handshake encryption.



### TLS Interface Summary

{{exchange-summary}} summarizes the exchange between QUIC and TLS for both
client and server. Each arrow is tagged with the encryption level used for
that transmission.

~~~
Client                                                    Server

Get Handshake
                      Initial ------------>
Rekey tx to 0-RTT Keys
                      0-RTT -------------->
                                              Handshake Received
                                                   Get Handshake
                      <------------ Initial
                                          Rekey rx to 0-RTT keys
                                              Handshake Received
                                      Rekey rx to Handshake keys
                                                   Get Handshake
                     <----------- Handshake
                                          Rekey tx to 1-RTT keys
Handshake Received
Rekey rx to Handshake keys
Handshake Received
Get Handshake
Handshake Complete
Rekey tx to 1-RTT keys
                      Handshake ---------->
                                              Handshake Received
                                          Rekey rx to 1-RTT keys
                                                   Get Handshake
                                              Handshake Complete
                     <--------------- 1-RTT
Handshake Received
~~~
{: #exchange-summary title="Interaction Summary between QUIC and TLS"}


## TLS Version

This document describes how TLS 1.3 {{!TLS13}} is used with QUIC.

In practice, the TLS handshake will negotiate a version of TLS to use.  This
could result in a newer version of TLS than 1.3 being negotiated if both
endpoints support that version.  This is acceptable provided that the features
of TLS 1.3 that are used by QUIC are supported by the newer version.

A badly configured TLS implementation could negotiate TLS 1.2 or another older
version of TLS.  An endpoint MUST terminate the connection if a version of TLS
older than 1.3 is negotiated.


## ClientHello Size {#clienthello-size}

QUIC requires that the initial handshake packet from a client fit within the
payload of a single packet.  The size limits on QUIC packets mean that a record
containing a ClientHello needs to fit within 1129 octets, though endpoints can
reduce the size of their connection ID to increase by up to 22 octets.

A TLS ClientHello can fit within this limit with ample space remaining.
However, there are several variables that could cause this limit to be exceeded.
Implementations are reminded that large session tickets or HelloRetryRequest
cookies, multiple or large key shares, and long lists of supported ciphers,
signature algorithms, versions, QUIC transport parameters, and other negotiable
parameters and extensions could cause this message to grow.

For servers, the size of the session tickets and HelloRetryRequest cookie
extension can have an effect on a client's ability to connect.  Choosing a small
value increases the probability that these values can be successfully used by a
client.

The TLS implementation does not need to ensure that the ClientHello is
sufficiently large.  QUIC PADDING frames are added to increase the size of the
packet as necessary.


## Peer Authentication

The requirements for authentication depend on the application protocol that is
in use.  TLS provides server authentication and permits the server to request
client authentication.

A client MUST authenticate the identity of the server.  This typically involves
verification that the identity of the server is included in a certificate and
that the certificate is issued by a trusted entity (see for example
{{?RFC2818}}).

A server MAY request that the client authenticate during the handshake. A server
MAY refuse a connection if the client is unable to authenticate when requested.
The requirements for client authentication vary based on application protocol
and deployment.

A server MUST NOT use post-handshake client authentication (see Section 4.6.2 of
{{!TLS13}}).


## Enabling 0-RTT {#enable-0rtt}

[TODO(ekr@rtfm.com): I'm not sure that this is correct any more.]
In order to be usable for 0-RTT, TLS MUST provide a NewSessionTicket message
that contains the "max_early_data" extension with the value 0xffffffff; the
amount of data which the client can send in 0-RTT is controlled by the
"initial_max_data" transport parameter supplied by the server.  A client MUST
treat receipt of a NewSessionTicket that contains a "max_early_data" extension
with any other value as a connection error of type PROTOCOL_VIOLATION.

Early data within the TLS connection MUST NOT be used.  As it is for other TLS
application data, a server MUST treat receiving early data on the TLS connection
as a connection error of type PROTOCOL_VIOLATION.

## Rejecting 0-RTT

A server rejects 0-RTT by rejecting 0-RTT at the TLS layer.  This results in
early exporter keys being unavailable, thereby preventing the use of 0-RTT for
QUIC.

A client that attempts 0-RTT MUST also consider 0-RTT to be rejected if it
receives a Version Negotiation packet.

When 0-RTT is rejected, all connection characteristics that the client assumed
might be incorrect.  This includes the choice of application protocol, transport
parameters, and any application configuration.  The client therefore MUST reset
the state of all streams, including application state bound to those streams.

## HelloRetryRequest

In TLS over TCP, the HelloRetryRequest feature ({{TLS13}; Section
4.1.4) can be used to correct a client's incorrect KeyShare extension
as well as for a stateless round trip check. From the perspective of
QUIC, this just looks like additional messages carried in the Initial
encryption level. Although it is in principle possible to use this
feature for address verification in QUIC, QUIC implementations SHOULD
instead use the Retry feature ({{QUIC-TRANSPORT}}; Section 4.4.2)).


## TLS Errors

If TLS experiences an error, it MUST generate an appropriate alert
as defined in {{TLS13}}; Section 6) and then provide it to QUIC,
which sends the alert in a CRYPTO_CLOSE frame. All such alerts are
"fatal".


# QUIC Packet Protection {#packet-protection}

As with TLS over TCP, QUIC encrypts packets with keys derived from the TLS
handshake, using the AEAD algorithm negotiated by TLS.


## QUIC Packet Encryption Keys {#encryption-keys}

QUIC derives packet encryption keys in the same way as TLS 1.3:
Each encryption level/direction pair has a secret value, which
is then used to derive the traffic keys using as described
in {{TLS13}}; Section 7.3.

The keys for the Initial encryption level are computed based on
the client's first Destination Connection Id, as described in
{{initial-secrets}}.

The keys for the remaining encryption level are computed in the same
fashion as the corresponding TLS keys (see {{TLS13}}; Section 7),
except that the label for HKDF-Expand-Label uses the prefix "quic "
rather than "tls 13". The purpose of this change is to provide key
separation between TLS and QUIC, so that TLS stacks can avoid
exposing TLS record protection keys.

### Initial Secrets {#initial-secrets}

Initial packets are protected with
a secret derived from the Destination Connection ID field from the client's
Initial packet.  Specifically:

~~~
initial_salt = 0x9c108f98520a5c5c32968e950e8a2c5fe06d6c38
initial_secret =
    HKDF-Extract(initial_salt, client_dst_connection_id)

client_initial_secret =
   HKDF-Expand-Label(initial_secret, "client in", Hash.length)
server_initial_secret =
   HKDF-Expand-Label(initial_secret, "server in", Hash.length)
~~~

The hash function for HKDF when deriving handshake secrets and keys is SHA-256
{{!SHA=DOI.10.6028/NIST.FIPS.180-4}}.  The connection ID used with
HKDF-Expand-Label is the connection ID chosen by the client.

initial_salt is a 20 octet sequence shown in the figure in hexadecimal
notation. Future versions of QUIC SHOULD generate a new salt value, thus
ensuring that the keys are different for each version of QUIC. This prevents a
middlebox that only recognizes one version of QUIC from seeing or modifying the
contents of handshake packets from future versions.

Note:

: The Destination Connection ID is of arbitrary length, and it could be zero
  length if the server sends a Retry packet with a zero-length Source Connection
  ID field.  In this case, the initial keys provide no assurance to the client
  that the server received its packet; the client has to rely on the exchange
  that included the Retry packet for that property.


## QUIC AEAD Usage {#aead}

The Authentication Encryption with Associated Data (AEAD) {{!AEAD}} function
used for QUIC packet protection is AEAD that is negotiated for use with the TLS
connection.  For example, if TLS is using the TLS_AES_128_GCM_SHA256, the
AEAD_AES_128_GCM function is used.

QUIC packets are protected prior to applying packet number encryption
({{pn-encrypt}}).  The unprotected packet number is part of the associated data
(A).  When removing packet protection, an endpoint first removes the protection
from the packet number.

All QUIC packets other than Version Negotiation and Stateless Reset packets are
protected with an AEAD algorithm {{!AEAD}}. Prior to establishing a shared
secret, packets are protected with AEAD_AES_128_GCM and a key derived from the
client's connection ID (see {{initial-secrets}}).  This provides protection
against off-path attackers and robustness against QUIC version unaware
middleboxes, but not against on-path attackers.

All ciphersuites currently defined for TLS 1.3 - and therefore QUIC - have a
16-byte authentication tag and produce an output 16 bytes larger than their
input.

The key and iv for the packet are computed as described in {{encryption-keys}}.
The nonce, N, is formed by combining the packet protection IV with the
packet number.  The 64 bits of the reconstructed QUIC packet number in
network byte order is left-padded with zeros to the size of the IV.
The exclusive OR of the padded packet number and the IV forms the AEAD
nonce.

The associated data, A, for the AEAD is the contents of the QUIC header,
starting from the flags octet in either the short or long header.

The input plaintext, P, for the AEAD is the content of the QUIC frame following
the header, as described in {{QUIC-TRANSPORT}}.

The output ciphertext, C, of the AEAD is transmitted in place of P.

Some AEAD functions have limits for how many packets can be encrypted under the
same key and IV (see for example {{AEBounds}}).  This might be lower than the
packet number limit.  An endpoint MUST initiate a key update ({{key-update}})
prior to exceeding any limit set for the AEAD that is in use.

## Packet Number Protection {#pn-encrypt}

QUIC packets are protected using a key that is derived from the current set of
secrets.  The key derived using the "pn" label is used to protect the packet
number from casual observation.  The packet number protection algorithm depends
on the negotiated AEAD.

Packet number protection is applied after packet protection is applied (see
{{aead}}).  The ciphertext of the packet is sampled and used as input to an
encryption algorithm.

In sampling the packet ciphertext, the packet number length is assumed to be the
smaller of the maximum possible packet number encoding (4 octets), or the size
of the protected packet minus the minimum expansion for the AEAD.  For example,
the sampled ciphertext for a packet with a short header can be determined by:

```
sample_offset = min(1 + connection_id_length + 4,
                    packet_length - aead_expansion)
sample = packet[sample_offset..sample_offset+sample_length]
```

To ensure that this process does not sample the packet number, packet number
protection algorithms MUST NOT sample more ciphertext than the minimum
expansion of the corresponding AEAD.

Packet number protection is applied to the packet number encoded as described
in Section 4.8 of {{QUIC-TRANSPORT}}. Since the length of the packet number is
stored in the first octet of the encoded packet number, it may be necessary to
progressively decrypt the packet number.

Before a TLS ciphersuite can be used with QUIC, a packet protection algorithm
MUST be specifed for the AEAD used with that ciphersuite.  This document defines
algorithms for AEAD_AES_128_GCM, AEAD_AES_128_CCM, AEAD_AES_256_GCM,
AEAD_AES_256_CCM (all AES AEADs are defined in {{!AEAD=RFC5116}}), and
AEAD_CHACHA20_POLY1305 ({{!CHACHA=RFC7539}}).


### AES-Based Packet Number Protection

This section defines the packet protection algorithm for AEAD_AES_128_GCM,
AEAD_AES_128_CCM, AEAD_AES_256_GCM, and AEAD_AES_256_CCM. AEAD_AES_128_GCM and
AEAD_AES_128_CCM use 128-bit AES {{!AES=DOI.10.6028/NIST.FIPS.197}} in
counter (CTR) mode. AEAD_AES_256_GCM, and AEAD_AES_256_CCM use
256-bit AES in CTR mode.

This algorithm samples 16 octets from the packet ciphertext. This value is
used as the counter input to AES-CTR.

~~~
encrypted_pn = AES-CTR(pn_key, sample, packet_number)
~~~


### ChaCha20-Based Packet Number Protection

When AEAD_CHACHA20_POLY1305 is in use, packet number protection uses the
raw ChaCha20 function as defined in Section 2.4 of {{!CHACHA}}.  This uses a
256-bit key and 16 octets sampled from the packet protection output.

The first 4 octets of the sampled ciphertext are interpreted as a 32-bit number
in little-endian order and are used as the block count.  The remaining 12 octets
are interpreted as three concatenated 32-bit numbers in little-endian order and
used as the nonce.

The encoded packet number is then encrypted with ChaCha20 directly. In
pseudocode:

~~~
counter = DecodeLE(sample[0..3])
nonce = DecodeLE(sample[4..7], sample[8..11], sample[12..15])
encrypted_pn = ChaCha20(pn_key, counter, nonce, packet_number)
~~~


## Receiving Protected Packets

Once an endpoint successfully receives a packet with a given packet
number, it MUST discard all packets in the same packet number space
with higher packet numbers if they cannot be successfully unprotected
with either the same key, or - if there is a key update - the next
packet protection key (see {{key-update}}).  Similarly, a packet that
appears to trigger a key update, but cannot be unprotected
successfully MUST be discarded.

Failure to unprotect a packet does not necessarily indicate the existence of a
protocol error in a peer or an attack.  The truncated packet number encoding
used in QUIC can cause packet numbers to be decoded incorrectly if they are
delayed significantly.


## Use of 0-RTT Keys {#using-early-data}

If 0-RTT keys are available (see {{enable-0rtt}}), the lack of replay protection
means that restrictions on their use are necessary to avoid replay attacks on
the protocol.

A client MUST only use 0-RTT keys to protect data that is idempotent.  A client
MAY wish to apply additional restrictions on what data it sends prior to the
completion of the TLS handshake.  A client otherwise treats 0-RTT keys as
equivalent to 1-RTT keys, except that ACKs for that data MUST only be sent with
1-RTT keys.

A client that receives an indication that its 0-RTT data has been accepted by a
server can send 0-RTT data until it receives all of the server's handshake
messages.  A client SHOULD stop sending 0-RTT data if it receives an indication
that 0-RTT data has been rejected.

A server MUST NOT use 0-RTT keys to protect packets.

: 0-RTT data can be acknowledged by the server as it receives it, but any
  packets containing acknowledgments of 0-RTT data cannot have packet protection
  removed by the client until the TLS handshake is complete.  The 1-RTT keys
  necessary to remove packet protection cannot be derived until the client
  receives all server handshake messages.


## Receiving Out-of-Order Protected Frames {#pre-hs-protected}

Due to reordering and loss, protected packets might be received by an endpoint
before the final TLS handshake messages are received.  A client will be unable
to decrypt 1-RTT packets from the server, whereas a server will be able to
decrypt 1-RTT packets from the client. However,
a server MUST NOT process data from incoming 1-RTT protected packets
before verifying either the client Finished message or - in the case that the
server has chosen to use a pre-shared key - the pre-shared key binder (see
Section 4.2.8 of {{!TLS13}}).  Verifying these values provides the server with
an assurance that the ClientHello has not been modified.
Packets protected with 1-RTT keys MAY be stored and later decrypted and used
once the handshake is complete.

A server could receive packets protected with 0-RTT keys prior to receiving a
TLS ClientHello.  The server MAY retain these packets for later decryption in
anticipation of receiving a ClientHello.

Receiving and verifying the TLS Finished message is critical in
ensuring the integrity of the TLS handshake.  A server MUST NOT use
1-RTT protected packets from the client prior to verifying the client
Finished message if its response depends on client authentication.


# Key Update

Once the 1-RTT keys are established and the short header is in use, it
is possible to update the keys, for instance because of limits on AEAD
encryption.  The KEY_PHASE bit in the short header is used to indicate
whether key updates have occurred. The KEY_PHASE bit is initially set
to 0 and then inverted with each key update {{key-update}}.

The KEY_PHASE bit allows a recipient to detect a change in keying
material without necessarily needing to receive the first packet that
triggered the change.  An endpoint that notices a changed KEY_PHASE
bit can update keys and decrypt the packet that contains the changed
bit, see {{key-update}}.

An endpoint MUST NOT initiate more than one key update at a time.  A new key
cannot be used until the endpoint has received and successfully decrypted a
packet with a matching KEY_PHASE.

A receiving endpoint detects an update when the KEY_PHASE bit doesn't match what
it is expecting.  It creates a new secret (see {{TLS13}}; Section 7.2) and the
corresponding read key and IV.  If the packet can be decrypted and authenticated
using these values, then the keys it uses for packet protection are also
updated.  The next packet sent by the endpoint will then use the new keys.

An endpoint doesn't need to send packets immediately when it detects that its
peer has updated keys.  The next packet that it sends will simply use the new
keys.  If an endpoint detects a second update before it has sent any packets
with updated keys it indicates that its peer has updated keys twice without
awaiting a reciprocal update.  An endpoint MUST treat consecutive key updates as
a fatal error and abort the connection.

An endpoint SHOULD retain old keys for a short period to allow it to decrypt
packets with smaller packet numbers than the packet that triggered the key
update.  This allows an endpoint to consume packets that are reordered around
the transition between keys.  Packets with higher packet numbers always use the
updated keys and MUST NOT be decrypted with old keys.

Keys and their corresponding secrets SHOULD be discarded when an endpoint has
received all packets with packet numbers lower than the lowest packet number
used for the new key.  An endpoint might discard keys if it determines that the
length of the delay to affected packets is excessive.

This ensures that once the handshake is complete, packets with the same
KEY_PHASE will have the same packet protection keys, unless there are multiple
key updates in a short time frame succession and significant packet reordering.

~~~
   Initiating Peer                    Responding Peer

@M QUIC Frames
               New Keys -> @N
@N QUIC Frames
                      -------->
                                          QUIC Frames @M
                          New Keys -> @N
                                          QUIC Frames @N
                      <--------
~~~
{: #ex-key-update title="Key Update"}

A packet that triggers a key update could arrive after successfully processing a
packet with a higher packet number.  This is only possible if there is a key
compromise and an attack, or if the peer is incorrectly reverting to use of old
keys.  Because the latter cannot be differentiated from an attack, an endpoint
MUST immediately terminate the connection if it detects this condition.

# Security of Initial Messages

Because the Initial messages are not securely encrypted, they are subject
to potential tampering by an attacker. Some forms of tampering -- such
as modifying the TLS messages themselves -- are detectable, but some
-- such as modifying ACKs -- are not. To give a concrete example,
an on-path attacker could modify the ACK to make it appear that
a packet had not been received or to create a false impression of
the state of the connection (e.g., by modifying the ACK Delay).
Implementations SHOULD use caution in relying on any data which
is contained in Initial packets that is not otherwise authenticated.

It is also possible for the attacker to tamper with data that
is carried in Handshake packets, but because that tampering
requires modifying TLS handshake messages, that tampering will be
detected as soon as the TLS handshake completes.


# QUIC-Specific Additions to the TLS Handshake

QUIC uses the TLS handshake for more than just negotiation of cryptographic
parameters.  The TLS handshake validates protocol version selection, provides
preliminary values for QUIC transport parameters, and allows a server to perform
return routeability checks on clients.


## Protocol and Version Negotiation {#version-negotiation}

The QUIC version negotiation mechanism is used to negotiate the version of QUIC
that is used prior to the completion of the handshake.  However, this packet is
not authenticated, enabling an active attacker to force a version downgrade.

To ensure that a QUIC version downgrade is not forced by an attacker, version
information is copied into the TLS handshake, which provides integrity
protection for the QUIC negotiation.  This does not prevent version downgrade
prior to the completion of the handshake, though it means that a downgrade
causes a handshake failure.

TLS uses Application Layer Protocol Negotiation (ALPN) {{!RFC7301}} to select an
application protocol.  The application-layer protocol MAY restrict the QUIC
versions that it can operate over.  Servers MUST select an application protocol
compatible with the QUIC version that the client has selected.

If the server cannot select a compatible combination of application protocol and
QUIC version, it MUST abort the connection. A client MUST abort a connection if
the server picks an incompatible combination of QUIC version and ALPN
identifier.


## QUIC Transport Parameters Extension {#quic_parameters}

QUIC transport parameters are carried in a TLS extension. Different versions of
QUIC might define a different format for this struct.

Including transport parameters in the TLS handshake provides integrity
protection for these values.

~~~
   enum {
      quic_transport_parameters(26), (65535)
   } ExtensionType;
~~~

The `extension_data` field of the quic_transport_parameters extension contains a
value that is defined by the version of QUIC that is in use.  The
quic_transport_parameters extension carries a TransportParameters when the
version of QUIC defined in {{QUIC-TRANSPORT}} is used.

The quic_transport_parameters extension is carried in the ClientHello and the
EncryptedExtensions messages during the handshake.

While the transport parameters are technically available prior to the
completion of the handshake, they cannot be fully trusted until the handshake
completes, and reliance on them should be minimized.
However, any tampering with the parameters will be detected
when the handshake completes.


## QUIC Max Crypto Data Extension {#max_crypto_data}

When QUIC provides TLS messages via the CRYPTO_HS frame, one TLS
message may be fragmented across different packets. TLS
implementations may choose to limit the data they buffer before the
handshake is completed and close the connection on receiving too much
data.

To communicate the maximum amount of data that TLS will allow to be sent in
CRYPTO_HS frames, TLS MAY use the `max_crypto_data` extension, defined as
follows:

~~~
   enum {
      max_crypto_data(27), (65535)
   } ExtensionType;

   struct {
      uint32 max_crypto_data;
   } MaxCryptoData;
~~~

max_crypto_data:

: The maximum number of bytes that can be sent in CRYPTO_HS frames

The `extension_data` field of the extension contains the MaxCryptoData
structure.

Implementations SHOULD send this extension.  Receivers do not need to
process this extension.  If a receiver does process this extension and
will not be able to fit its handshake into the limit, it SHOULD
terminate the connection with a TODO error. If an implementation sends
this extension and received more than max_crypto_data bytes from its
peer, it SHOULD terminate the connection with a TODO error. The
purpose of this extension is to provide a facility to debug issues
during the handshake and also allow future extensibility of the
protocol to larger message sizes.


# Security Considerations

There are likely to be some real clangers here eventually, but the current set
of issues is well captured in the relevant sections of the main text.

Never assume that because it isn't in the security considerations section it
doesn't affect security.  Most of this document does.


## Packet Reflection Attack Mitigation {#reflection}

A small ClientHello that results in a large block of handshake messages from a
server can be used in packet reflection attacks to amplify the traffic generated
by an attacker.

QUIC includes three defenses against this attack. First, the packet
containing a ClientHello be padded to a minimum size. Second, if
responding to an unverified source address, the server is forbidden to
send more than three packets in its first flight ({{QUIC-TRANSPORT}};
Section 4.4.3). Finally, because ACKs of Handshake packets
are authenticated, a blind attacker cannot forge them
Put together, these defenses limit the level of amplification.


## Peer Denial of Service {#useless}

QUIC, TLS and HTTP/2 all contain a messages that have legitimate uses in some
contexts, but that can be abused to cause a peer to expend processing resources
without having any observable impact on the state of the connection.  If
processing is disproportionately large in comparison to the observable effects
on bandwidth or state, then this could allow a malicious peer to exhaust
processing capacity without consequence.

QUIC prohibits the sending of empty `STREAM` frames unless they are marked with
the FIN bit.  This prevents `STREAM` frames from being sent that only waste
effort.

While there are legitimate uses for some redundant packets, implementations
SHOULD track redundant packets and treat excessive volumes of any non-productive
packets as indicative of an attack.


## Packet Number Protection Analysis {#pn-encrypt-analysis}

Packet number protection relies the packet protection AEAD being a
pseudorandom function (PRF), which is not a property that AEAD algorithms
guarantee. Therefore, no strong assurances about the general security of this
mechanism can be shown in the general case. The AEAD algorithms described in
this document are assumed to be PRFs.

The packet number protection algorithms defined in this document take the
form:

```
encrypted_pn = packet_number XOR PRF(pn_key, sample)
```

This construction is secure against chosen plaintext attacks (IND-CPA)
{{IMC}}.

Use of the same key and ciphertext sample more than once risks compromising
packet number protection. Protecting two different packet numbers with the same
key and ciphertext sample reveals the exclusive OR of those packet numbers.
Assuming that the AEAD acts as a PRF, if L bits are sampled, the odds of two
ciphertext samples being identical approach 2^(-L/2), that is, the birthday
bound. For the algorithms described in this document, that probability is one
in 2^64.

Note:

: In some cases, inputs shorter than the full size required by the packet
  protection algorithm might be used.

To prevent an attacker from modifying packet numbers, values of packet numbers
are transitively authenticated using packet protection; packet numbers are part
of the authenticated additional data.  A falsified or modified packet number can
only be detected once the packet protection is removed.

An attacker can guess values for packet numbers and have an endpoint confirm
guesses through timing side channels.  If the recipient of a packet discards
packets with duplicate packet numbers without attempting to remove packet
protection they could reveal through timing side-channels that the packet number
matches a received packet.  For authentication to be free from side-channels,
the entire process of packet number protection removal, packet number recovery,
and packet protection removal MUST be applied together without timing and other
side-channels.

For the sending of packets, construction and protection of packet payloads and
packet numbers MUST be free from side-channels that would reveal the packet
number or its encoded size.


# IANA Considerations

This document does not create any new IANA registries, but it registers the
values in the following registries:

* TLS ExtensionsType Registry
  {{!TLS-REGISTRIES=I-D.ietf-tls-iana-registry-updates}} - IANA is to register
  the quic_transport_parameters extension found in {{quic_parameters}} as well
  as the max_crypto_data extension found in {{max_crypto_data}}
  Assigning 26 and 27 to the extensions respectively would be greatly
  appreciated.  The Recommended column is to be marked Yes.  The TLS 1.3 Column
  is to include CH and EE.


--- back

# Contributors

Ryan Hamilton was originally an author of this specification.


# Acknowledgments

This document has benefited from input from Dragana Damjanovic, Christian
Huitema, Jana Iyengar, Adam Langley, Roberto Peon, Eric Rescorla, Ian Swett, and
many others.

# Change Log

> **RFC Editor's Note:** Please remove this section prior to publication of a
> final version of this document.

Issue and pull request numbers are listed with a leading octothorp.

## Since draft-ietf-quic-tls-12

- Big restructure to align with the "QUIC record layer for TLS" proposal.
- Remove source address validation from TLS in favor of Retry.

## Since draft-ietf-quic-tls-11

- Encrypted packet numbers.

## Since draft-ietf-quic-tls-10

- No significant changes.

## Since draft-ietf-quic-tls-09

- Cleaned up key schedule and updated the salt used for handshake packet
  protection (#1077)

## Since draft-ietf-quic-tls-08

- Specify value for max_early_data_size to enable 0-RTT (#942)
- Update key derivation function (#1003, #1004)

## Since draft-ietf-quic-tls-07

- Handshake errors can be reported with CONNECTION_CLOSE (#608, #891)

## Since draft-ietf-quic-tls-05

No significant changes.

## Since draft-ietf-quic-tls-04

- Update labels used in HKDF-Expand-Label to match TLS 1.3 (#642)

## Since draft-ietf-quic-tls-03

No significant changes.

## Since draft-ietf-quic-tls-02

- Updates to match changes in transport draft


## Since draft-ietf-quic-tls-01

- Use TLS alerts to signal TLS errors (#272, #374)
- Require ClientHello to fit in a single packet (#338)
- The second client handshake flight is now sent in the clear (#262, #337)
- The QUIC header is included as AEAD Associated Data (#226, #243, #302)
- Add interface necessary for client address validation (#275)
- Define peer authentication (#140)
- Require at least TLS 1.3 (#138)
- Define transport parameters as a TLS extension (#122)
- Define handling for protected packets before the handshake completes (#39)
- Decouple QUIC version and ALPN (#12)


## Since draft-ietf-quic-tls-00

- Changed bit used to signal key phase
- Updated key phase markings during the handshake
- Added TLS interface requirements section
- Moved to use of TLS exporters for key derivation
- Moved TLS error code definitions into this document

## Since draft-thomson-quic-tls-01

- Adopted as base for draft-ietf-quic-tls
- Updated authors/editors list
- Added status note

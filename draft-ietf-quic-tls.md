---
title: Using TLS to Secure QUIC
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
    email: mt@lowentropy.net
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

  QUIC-HTTP:
    title: "Hypertext Transfer Protocol Version 3 (HTTP/3)"
    date: {DATE}
    seriesinfo:
      Internet-Draft: draft-ietf-quic-http-latest
    author:
      -
        ins: M. Bishop
        name: Mike Bishop
        org: Akamai Technologies
        role: editor


--- abstract

This document describes how Transport Layer Security (TLS) is used to secure
QUIC.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
[](https://mailarchive.ietf.org/arch/search/?email_list=quic).

Working Group information can be found at [](https://github.com/quicwg); source
code and issues list for this draft can be found at
[](https://github.com/quicwg/base-drafts/labels/-tls).

--- middle

# Introduction

This document describes how QUIC {{QUIC-TRANSPORT}} is secured using TLS
{{!TLS13=RFC8446}}.

TLS 1.3 provides critical latency improvements for connection establishment over
previous versions.  Absent packet loss, most new connections can be established
and secured within a single round trip; on subsequent connections between the
same client and server, the client can often send application data immediately,
that is, using a zero round trip setup.

This document describes how TLS acts as a security component of QUIC.


# Notational Conventions

{::boilerplate bcp14}

This document uses the terminology established in {{QUIC-TRANSPORT}}.

For brevity, the acronym TLS is used to refer to TLS 1.3, though a newer version
could be used; see {{tls-version}}.


## TLS Overview

TLS provides two endpoints with a way to establish a means of communication over
an untrusted medium (that is, the Internet) that ensures that messages they
exchange cannot be observed, modified, or forged.

Internally, TLS is a layered protocol, with the structure shown in
{{tls-layers}}.

~~~~
          +-------------+------------+--------------+---------+
Handshake |             |            |  Application |         |
Layer     |  Handshake  |   Alerts   |     Data     |   ...   |
          |             |            |              |         |
          +-------------+------------+--------------+---------+
Record    |                                                   |
Layer     |                      Records                      |
          |                                                   |
          +---------------------------------------------------+
~~~~
{: #tls-layers title="TLS Layers"}

Each Handshake layer message (e.g., Handshake, Alerts, and Application Data) is
carried as a series of typed TLS records by the Record layer.  Records are
individually cryptographically protected and then transmitted over a reliable
transport (typically TCP), which provides sequencing and guaranteed delivery.

The TLS authenticated key exchange occurs between two endpoints: client and
server.  The client initiates the exchange and the server responds.  If the key
exchange completes successfully, both client and server will agree on a secret.
TLS supports both pre-shared key (PSK) and Diffie-Hellman over either finite
fields or elliptic curves ((EC)DHE) key exchanges.  PSK is the basis for Early
Data (0-RTT); the latter provides perfect forward secrecy (PFS) when the (EC)DHE
keys are destroyed.

After completing the TLS handshake, the client will have learned and
authenticated an identity for the server and the server is optionally able to
learn and authenticate an identity for the client.  TLS supports X.509
{{?RFC5280}} certificate-based authentication for both server and client.

The TLS key exchange is resistant to tampering by attackers and it produces
shared secrets that cannot be controlled by either participating peer.

TLS provides two basic handshake modes of interest to QUIC:

 * A full 1-RTT handshake, in which the client is able to send Application Data
   after one round trip and the server immediately responds after receiving the
   first handshake message from the client.

 * A 0-RTT handshake, in which the client uses information it has previously
   learned about the server to send Application Data immediately.  This
   Application Data can be replayed by an attacker so it MUST NOT carry a
   self-contained trigger for any non-idempotent action.

A simplified TLS handshake with 0-RTT application data is shown in {{tls-full}}.

~~~
    Client                                             Server

    ClientHello
   (0-RTT Application Data)  -------->
                                                  ServerHello
                                         {EncryptedExtensions}
                                                    {Finished}
                             <--------      [Application Data]
   {Finished}                -------->

   [Application Data]        <------->      [Application Data]

    () Indicates messages protected by Early Data (0-RTT) Keys
    {} Indicates messages protected using Handshake Keys
    [] Indicates messages protected using Application Data
       (1-RTT) Keys
~~~
{: #tls-full title="TLS Handshake with 0-RTT"}

{{tls-full}} omits the EndOfEarlyData message, which is not used in QUIC; see
{{remove-eoed}}. Likewise, neither ChangeCipherSpec nor KeyUpdate messages are
used by QUIC. ChangeCipherSpec is redundant in TLS 1.3; see {{compat-mode}}.
QUIC has its own key update mechanism; see {{key-update}}.

Data is protected using a number of encryption levels:

- Initial Keys
- Early Data (0-RTT) Keys
- Handshake Keys
- Application Data (1-RTT) Keys

Application Data may appear only in the Early Data and Application Data
levels. Handshake and Alert messages may appear in any level.

The 0-RTT handshake is only possible if the client and server have previously
communicated.  In the 1-RTT handshake, the client is unable to send protected
Application Data until it has received all of the Handshake messages sent by the
server.


# Protocol Overview

QUIC {{QUIC-TRANSPORT}} assumes responsibility for the confidentiality and
integrity protection of packets.  For this it uses keys derived from a TLS
handshake {{!TLS13}}, but instead of carrying TLS records over QUIC (as with
TCP), TLS Handshake and Alert messages are carried directly over the QUIC
transport, which takes over the responsibilities of the TLS record layer, as
shown in {{quic-layers}}.

~~~~
+--------------+--------------+ +-------------+
|     TLS      |     TLS      | |    QUIC     |
|  Handshake   |    Alerts    | | Applications|
|              |              | |  (h3, etc.) |
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
{: #quic-layers title="QUIC Layers"}

QUIC also relies on TLS for authentication and negotiation of parameters that
are critical to security and performance.

Rather than a strict layering, these two protocols cooperate: QUIC uses the TLS
handshake; TLS uses the reliability, ordered delivery, and record layer provided
by QUIC.

At a high level, there are two main interactions between the TLS and QUIC
components:

* The TLS component sends and receives messages via the QUIC component, with
  QUIC providing a reliable stream abstraction to TLS.

* The TLS component provides a series of updates to the QUIC component,
  including (a) new packet protection keys to install (b) state changes such as
  handshake completion, the server certificate, etc.

{{schematic}} shows these interactions in more detail, with the QUIC packet
protection being called out specially.

~~~
+------------+                               +------------+
|            |<---- Handshake Messages ----->|            |
|            |<- Validate 0-RTT parameters ->|            |
|            |<--------- 0-RTT Keys ---------|            |
|    QUIC    |<------- Handshake Keys -------|    TLS     |
|            |<--------- 1-RTT Keys ---------|            |
|            |<------- Handshake Done -------|            |
+------------+                               +------------+
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

Unlike TLS over TCP, QUIC applications that want to send data do not send it
through TLS "application_data" records. Rather, they send it as QUIC STREAM
frames or other frame types, which are then carried in QUIC packets.

# Carrying TLS Messages {#carrying-tls}

QUIC carries TLS handshake data in CRYPTO frames, each of which consists of a
contiguous block of handshake data identified by an offset and length. Those
frames are packaged into QUIC packets and encrypted under the current TLS
encryption level.  As with TLS over TCP, once TLS handshake data has been
delivered to QUIC, it is QUIC's responsibility to deliver it reliably. Each
chunk of data that is produced by TLS is associated with the set of keys that
TLS is currently using.  If QUIC needs to retransmit that data, it MUST use the
same keys even if TLS has already updated to newer keys.

One important difference between TLS records (used with TCP) and QUIC CRYPTO
frames is that in QUIC multiple frames may appear in the same QUIC packet as
long as they are associated with the same packet number space. For instance,
an endpoint can bundle a Handshake message and an ACK for some Handshake data
into the same packet. Note that some frames are prohibited in different packet
number spaces, as described in Section 12.4 of {{QUIC-TRANSPORT}}.

Because packets could be reordered on the wire, QUIC uses the packet type to
indicate which keys were used to protect a given packet, as shown in
{{packet-types-keys}}. When packets of different types need to be sent,
endpoints SHOULD use coalesced packets to send them in the same UDP datagram.

| Packet Type         | Encryption Keys | PN Space         |
|:--------------------|:----------------|:-----------------|
| Initial             | Initial secrets | Initial          |
| 0-RTT Protected     | 0-RTT           | Application data |
| Handshake           | Handshake       | Handshake        |
| Retry               | Retry           | N/A              |
| Version Negotiation | N/A             | N/A              |
| Short Header        | 1-RTT           | Application data |
{: #packet-types-keys title="Encryption Keys by Packet Type"}

Section 20 of {{QUIC-TRANSPORT}} shows how packets at the various encryption
levels fit into the handshake process.


## Interface to TLS

As shown in {{schematic}}, the interface from QUIC to TLS consists of four
primary functions:

- Sending and receiving handshake messages
- Processing stored transport and application state from a resumed session
  and determining if it is valid to accept early data
- Rekeying (both transmit and receive)
- Handshake state updates

Additional functions might be needed to configure TLS.


### Handshake Complete {#handshake-complete}

In this document, the TLS handshake is considered complete when the TLS stack
has reported that the handshake is complete.  This happens when the TLS stack
has both sent a Finished message and verified the peer's Finished message.
Verifying the peer's Finished provides the endpoints with an assurance that
previous handshake messages have not been modified.  Note that the handshake
does not complete at both endpoints simultaneously.  Consequently, any
requirement that is based on the completion of the handshake depends on the
perspective of the endpoint in question.


### Handshake Confirmed {#handshake-confirmed}

In this document, the TLS handshake is considered confirmed at the server when
the handshake completes.  At the client, the handshake is considered confirmed
when a HANDSHAKE_DONE frame is received.

A client MAY consider the handshake to be confirmed when it receives an
acknowledgement for a 1-RTT packet.  This can be implemented by recording the
lowest packet number sent with 1-RTT keys, and comparing it to the Largest
Acknowledged field in any received 1-RTT ACK frame: once the latter is greater
than or equal to the former, the handshake is confirmed.


### Sending and Receiving Handshake Messages

In order to drive the handshake, TLS depends on being able to send and receive
handshake messages. There are two basic functions on this interface: one where
QUIC requests handshake messages and one where QUIC provides bytes that comprise
handshake messages.

Before starting the handshake QUIC provides TLS with the transport parameters
(see {{quic_parameters}}) that it wishes to carry.

A QUIC client starts TLS by requesting TLS handshake bytes from TLS.  The client
acquires handshake bytes before sending its first packet.  A QUIC server starts
the process by providing TLS with the client's handshake bytes.

At any time, the TLS stack at an endpoint will have a current sending
encryption level and receiving encryption level. Encryption levels determine
the packet type and keys that are used for protecting data.

Each encryption level is associated with a different sequence of bytes, which is
reliably transmitted to the peer in CRYPTO frames. When TLS provides handshake
bytes to be sent, they are appended to the handshake bytes for the current
encryption level. The encryption level then determines the type of packet that
the resulting CRYPTO frame is carried in; see {{packet-types-keys}}.

Four encryption levels are used, producing keys for Initial, 0-RTT, Handshake,
and 1-RTT packets. CRYPTO frames are carried in just three of these levels,
omitting the 0-RTT level. These four levels correspond to three packet number
spaces: Initial and Handshake encrypted packets use their own separate spaces;
0-RTT and 1-RTT packets use the application data packet number space.

QUIC takes the unprotected content of TLS handshake records as the content of
CRYPTO frames. TLS record protection is not used by QUIC. QUIC assembles
CRYPTO frames into QUIC packets, which are protected using QUIC packet
protection.

QUIC is only capable of conveying TLS handshake records in CRYPTO frames.  TLS
alerts are turned into QUIC CONNECTION_CLOSE error codes; see {{tls-errors}}.
TLS application data and other message types cannot be carried by QUIC at any
encryption level; it is an error if they are received from the TLS stack.

When an endpoint receives a QUIC packet containing a CRYPTO frame from the
network, it proceeds as follows:

- If the packet uses the current TLS receiving encryption level, sequence the
  data into the input flow as usual. As with STREAM frames, the offset is used
  to find the proper location in the data sequence.  If the result of this
  process is that new data is available, then it is delivered to TLS in order.

- If the packet is from a previously installed encryption level, it MUST NOT
  contain data that extends past the end of previously received data in that
  flow. Implementations MUST treat any violations of this requirement as a
  connection error of type PROTOCOL_VIOLATION.

- If the packet is from a new encryption level, it is saved for later processing
  by TLS.  Once TLS moves to receiving from this encryption level, saved data
  can be provided to TLS.  When providing data from any new encryption level to
  TLS, if there is data from a previous encryption level that TLS has not
  consumed, this MUST be treated as a connection error of type
  PROTOCOL_VIOLATION.

Each time that TLS is provided with new data, new handshake bytes are requested
from TLS.  TLS might not provide any bytes if the handshake messages it has
received are incomplete or it has no data to send.

The content of CRYPTO frames might either be processed incrementally by TLS or
buffered until complete messages or flights are available.  TLS is responsible
for buffering handshake bytes that have arrived in order.  QUIC is responsible
for buffering handshake bytes that arrive out of order or for encryption levels
that are not yet ready.  QUIC does not provide any means of flow control for
CRYPTO frames; see Section 7.5 of {{QUIC-TRANSPORT}}.

Once the TLS handshake is complete, this is indicated to QUIC along with any
final handshake bytes that TLS needs to send.  TLS also provides QUIC with the
transport parameters that the peer advertised during the handshake.

Once the handshake is complete, TLS becomes passive.  TLS can still receive data
from its peer and respond in kind, but it will not need to send more data unless
specifically requested - either by an application or QUIC.  One reason to send
data is that the server might wish to provide additional or updated session
tickets to a client.

When the handshake is complete, QUIC only needs to provide TLS with any data
that arrives in CRYPTO streams.  In the same way that is done during the
handshake, new data is requested from TLS after providing received data.


### Encryption Level Changes

As keys at a given encryption level become available to TLS, TLS indicates to
QUIC that reading or writing keys at that encryption level are available.

The availability of new keys is always a result of providing inputs to TLS.  TLS
only provides new keys after being initialized (by a client) or when provided
with new handshake data.

However, a TLS implementation could perform some of its processing
asynchronously. In particular, the process of validating a certificate can take
some time. While waiting for TLS processing to complete, an endpoint SHOULD
buffer received packets if they might be processed using keys that aren't yet
available. These packets can be processed once keys are provided by TLS. An
endpoint SHOULD continue to respond to packets that can be processed during this
time.

After processing inputs, TLS might produce handshake bytes, keys for new
encryption levels, or both.

TLS provides QUIC with three items as a new encryption level becomes available:

* A secret

* An Authenticated Encryption with Associated Data (AEAD) function

* A Key Derivation Function (KDF)

These values are based on the values that TLS negotiates and are used by QUIC to
generate packet and header protection keys; see {{protection-keys}}.

If 0-RTT is possible, it is ready after the client sends a TLS ClientHello
message or the server receives that message.  After providing a QUIC client with
the first handshake bytes, the TLS stack might signal the change to 0-RTT
keys. On the server, after receiving handshake bytes that contain a ClientHello
message, a TLS server might signal that 0-RTT keys are available.

Although TLS only uses one encryption level at a time, QUIC may use more than
one level. For instance, after sending its Finished message (using a CRYPTO
frame at the Handshake encryption level) an endpoint can send STREAM data (in
1-RTT encryption). If the Finished message is lost, the endpoint uses the
Handshake encryption level to retransmit the lost message.  Reordering or loss
of packets can mean that QUIC will need to handle packets at multiple encryption
levels.  During the handshake, this means potentially handling packets at higher
and lower encryption levels than the current encryption level used by TLS.

In particular, server implementations need to be able to read packets at the
Handshake encryption level at the same time as the 0-RTT encryption level.  A
client could interleave ACK frames that are protected with Handshake keys with
0-RTT data and the server needs to process those acknowledgments in order to
detect lost Handshake packets.

QUIC also needs access to keys that might not ordinarily be available to a TLS
implementation.  For instance, a client might need to acknowledge Handshake
packets before it is ready to send CRYPTO frames at that encryption level.  TLS
therefore needs to provide keys to QUIC before it might produce them for its own
use.


### TLS Interface Summary

{{exchange-summary}} summarizes the exchange between QUIC and TLS for both
client and server. Solid arrows indicate packets that carry handshake data;
dashed arrows show where application data can be sent.  Each arrow is tagged
with the encryption level used for that transmission.

~~~
Client                                                    Server
======                                                    ======

Get Handshake
                     Initial ------------->
Install tx 0-RTT Keys
                     0-RTT - - - - - - - ->

                                              Handshake Received
                                                   Get Handshake
                     <------------- Initial
                                           Install rx 0-RTT keys
                                          Install Handshake keys
                                                   Get Handshake
                     <----------- Handshake
                                           Install tx 1-RTT keys
                     <- - - - - - - - 1-RTT

Handshake Received (Initial)
Install Handshake keys
Handshake Received (Handshake)
Get Handshake
                     Handshake ----------->
Handshake Complete
Install 1-RTT keys
                     1-RTT - - - - - - - ->

                                              Handshake Received
                                              Handshake Complete
                                           Install rx 1-RTT keys
~~~
{: #exchange-summary title="Interaction Summary between QUIC and TLS"}

{{exchange-summary}} shows the multiple packets that form a single "flight" of
messages being processed individually, to show what incoming messages trigger
different actions.  New handshake messages are requested after incoming packets
have been processed.  This process varies based on the structure of endpoint
implementations and the order in which packets arrive; this is intended to
illustrate the steps involved in a single handshake exchange.


## TLS Version {#tls-version}

This document describes how TLS 1.3 {{!TLS13}} is used with QUIC.

In practice, the TLS handshake will negotiate a version of TLS to use.  This
could result in a newer version of TLS than 1.3 being negotiated if both
endpoints support that version.  This is acceptable provided that the features
of TLS 1.3 that are used by QUIC are supported by the newer version.

Clients MUST NOT offer TLS versions older than 1.3.  A badly configured TLS
implementation could negotiate TLS 1.2 or another older version of TLS.  An
endpoint MUST terminate the connection if a version of TLS older than 1.3 is
negotiated.


## ClientHello Size {#clienthello-size}

The first Initial packet from a client contains the start or all of its first
cryptographic handshake message, which for TLS is the ClientHello.  Servers
might need to parse the entire ClientHello (e.g., to access extensions such as
Server Name Identification (SNI) or Application Layer Protocol Negotiation
(ALPN)) in order to decide whether to accept the new incoming QUIC connection.
If the ClientHello spans multiple Initial packets, such servers would need to
buffer the first received fragments, which could consume excessive resources if
the client's address has not yet been validated.  To avoid this, servers MAY
use the Retry feature (see Section 8.1 of {{QUIC-TRANSPORT}}) to only buffer
partial ClientHello messages from clients with a validated address.

QUIC packet and framing add at least 36 bytes of overhead to the ClientHello
message.  That overhead increases if the client chooses a connection ID without
zero length.  Overheads also do not include the token or a connection ID longer
than 8 bytes, both of which might be required if a server sends a Retry packet.

A typical TLS ClientHello can easily fit into a 1200-byte packet.  However, in
addition to the overheads added by QUIC, there are several variables that could
cause this limit to be exceeded.  Large session tickets, multiple or large key
shares, and long lists of supported ciphers, signature algorithms, versions,
QUIC transport parameters, and other negotiable parameters and extensions could
cause this message to grow.

For servers, in addition to connection IDs and tokens, the size of TLS session
tickets can have an effect on a client's ability to connect efficiently.
Minimizing the size of these values increases the probability that clients can
use them and still fit their ClientHello message in their first Initial packet.

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

Note:

: Where servers provide certificates for authentication, the size of
  the certificate chain can consume a large number of bytes.  Controlling the
  size of certificate chains is critical to performance in QUIC as servers are
  limited to sending 3 bytes for every byte received prior to validating the
  client address; see Section 8.1 of {{QUIC-TRANSPORT}}.  The size of a
  certificate chain can be managed by limiting the number of names or
  extensions; using keys with small public key representations, like ECDSA; or
  by using certificate compression
  {{?COMPRESS=I-D.ietf-tls-certificate-compression}}.

A server MAY request that the client authenticate during the handshake. A server
MAY refuse a connection if the client is unable to authenticate when requested.
The requirements for client authentication vary based on application protocol
and deployment.

A server MUST NOT use post-handshake client authentication (as defined in
Section 4.6.2 of {{!TLS13}}), because the multiplexing offered by QUIC prevents
clients from correlating the certificate request with the application-level
event that triggered it (see {{?HTTP2-TLS13=RFC8740}}).
More specifically, servers MUST NOT send post-handshake TLS CertificateRequest
messages and clients MUST treat receipt of such messages as a connection error
of type PROTOCOL_VIOLATION.


## Session Resumption {#resumption}

QUIC can use the session resumption feature of TLS 1.3. It does this by
carrying NewSessionTicket messages in CRYPTO frames after the handshake is
complete. Session resumption is the basis of 0-RTT, but can be used without
also enabling 0-RTT.

Endpoints that use session resumption might need to remember some information
about the current connection when creating a resumed connection. TLS requires
that some information be retained; see Section 4.6.1 of {{!TLS13}}. QUIC itself
does not depend on any state being retained when resuming a connection, unless
0-RTT is also used; see {{enable-0rtt}} and Section 7.4.1 of
{{QUIC-TRANSPORT}}. Application protocols could depend on state that is
retained between resumed connections.

Clients can store any state required for resumption along with the session
ticket. Servers can use the session ticket to help carry state.

Session resumption allows servers to link activity on the original connection
with the resumed connection, which might be a privacy issue for clients.
Clients can choose not to enable resumption to avoid creating this correlation.
Client SHOULD NOT reuse tickets as that allows entities other than the server
to correlate connections; see Section C.4 of {{!TLS13}}.


## 0-RTT

The 0-RTT feature in QUIC allows a client to send application data before the
handshake is complete.  This is made possible by reusing negotiated parameters
from a previous connection.  To enable this, 0-RTT depends on the client
remembering critical parameters and providing the server with a TLS session
ticket that allows the server to recover the same information.

This information includes parameters that determine TLS state, as governed by
{{!TLS13}}, QUIC transport parameters, the chosen application protocol, and any
information the application protocol might need; see {{app-0rtt}}.  This
information determines how 0-RTT packets and their contents are formed.

To ensure that the same information is available to both endpoints, all
information used to establish 0-RTT comes from the same connection.  Endpoints
cannot selectively disregard information that might alter the sending or
processing of 0-RTT.

{{!TLS13}} sets a limit of 7 days on the time between the original connection
and any attempt to use 0-RTT.  There are other constraints on 0-RTT usage,
notably those caused by the potential exposure to replay attack; see
{{QUIC-TRANSPORT}}.


### Enabling 0-RTT {#enable-0rtt}

To communicate their willingness to process 0-RTT data, servers send a
NewSessionTicket message that contains the early_data extension with a
max_early_data_size of 0xffffffff.  The TLS max_early_data_size parameter is not
used in QUIC.  The amount of data that the client can send in 0-RTT is
controlled by the initial_max_data transport parameter supplied by the server.

Servers MUST NOT send the early_data extension with a max_early_data_size field
set to any value other than 0xffffffff.  A client MUST treat receipt of a
NewSessionTicket that contains an early_data extension with any other value as
a connection error of type PROTOCOL_VIOLATION.

A client that wishes to send 0-RTT packets uses the early_data extension in
the ClientHello message of a subsequent handshake; see Section 4.2.10 of
{{!TLS13}}. It then sends application data in 0-RTT packets.

A client that attempts 0-RTT might also provide an address validation token if
the server has sent a NEW_TOKEN frame; see Section 8.1 of {{QUIC-TRANSPORT}}.


### Accepting and Rejecting 0-RTT

A server accepts 0-RTT by sending an early_data extension in the
EncryptedExtensions (see Section 4.2.10 of {{!TLS13}}).  The server then
processes and acknowledges the 0-RTT packets that it receives.

A server rejects 0-RTT by sending the EncryptedExtensions without an early_data
extension.  A server will always reject 0-RTT if it sends a TLS
HelloRetryRequest.  When rejecting 0-RTT, a server MUST NOT process any 0-RTT
packets, even if it could.  When 0-RTT was rejected, a client SHOULD treat
receipt of an acknowledgement for a 0-RTT packet as a connection error of type
PROTOCOL_VIOLATION, if it is able to detect the condition.

When 0-RTT is rejected, all connection characteristics that the client assumed
might be incorrect.  This includes the choice of application protocol, transport
parameters, and any application configuration.  The client therefore MUST reset
the state of all streams, including application state bound to those streams.

A client MAY reattempt 0-RTT if it receives a Retry or Version Negotiation
packet.  These packets do not signify rejection of 0-RTT.


### Validating 0-RTT Configuration {#app-0rtt}

When a server receives a ClientHello with the early_data extension, it has to
decide whether to accept or reject early data from the client. Some of this
decision is made by the TLS stack (e.g., checking that the cipher suite being
resumed was included in the ClientHello; see Section 4.2.10 of {{!TLS13}}). Even
when the TLS stack has no reason to reject early data, the QUIC stack or the
application protocol using QUIC might reject early data because the
configuration of the transport or application associated with the resumed
session is not compatible with the server's current configuration.

QUIC requires additional transport state to be associated with a 0-RTT session
ticket. One common way to implement this is using stateless session tickets and
storing this state in the session ticket. Application protocols that use QUIC
might have similar requirements regarding associating or storing state. This
associated state is used for deciding whether early data must be rejected. For
example, HTTP/3 ({{QUIC-HTTP}}) settings determine how early data from the
client is interpreted. Other applications using QUIC could have different
requirements for determining whether to accept or reject early data.


## HelloRetryRequest

The HelloRetryRequest message (see Section 4.1.4 of {{!TLS13}}) can be used to
request that a client provide new information, such as a key share, or to
validate some characteristic of the client.  From the perspective of QUIC,
HelloRetryRequest is not differentiated from other cryptographic handshake
messages that are carried in Initial packets. Although it is in principle
possible to use this feature for address verification, QUIC implementations
SHOULD instead use the Retry feature; see Section 8.1 of {{QUIC-TRANSPORT}}.


## TLS Errors {#tls-errors}

If TLS experiences an error, it generates an appropriate alert as defined in
Section 6 of {{!TLS13}}.

A TLS alert is converted into a QUIC connection error. The alert description is
added to 0x100 to produce a QUIC error code from the range reserved for
CRYPTO_ERROR. The resulting value is sent in a QUIC CONNECTION_CLOSE frame of
type 0x1c.

The alert level of all TLS alerts is "fatal"; a TLS stack MUST NOT generate
alerts at the "warning" level.

QUIC permits the use of a generic code in place of a specific error code; see
Section 11 of {{QUIC-TRANSPORT}}. For TLS alerts, this includes replacing any
alert with a generic alert, such as handshake_failure (0x128 in QUIC).
Endpoints MAY use a generic error code to avoid possibly exposing confidential
information.


# Packet Protection Keys {#protection-keys}

As with TLS over TCP, QUIC protects packets with keys derived from the TLS
handshake, using the AEAD algorithm {{!AEAD=RFC5116}} negotiated by TLS.  QUIC
derives packet protection keys in the same way that TLS derives record
protection keys.

Each encryption level has separate secret values for protection of packets sent
in each direction.  These traffic secrets are derived by TLS (see Section 7.1 of
{{!TLS13}}) and are used by QUIC for all encryption levels except the Initial
encryption level.  The secrets for the Initial encryption level are computed
based on the client's initial Destination Connection ID, as described in
{{QUIC-TRANSPORT}}.

The keys used for packet protection are computed from the TLS secrets using the
KDF provided by TLS.  In TLS 1.3, the HKDF-Expand-Label function described in
Section 7.1 of {{!TLS13}} is used, using the hash function from the negotiated
cipher suite.  Other versions of TLS MUST provide a similar function in order to
be used with QUIC.

The current encryption level secret and the label "quic key" are input to the
KDF to produce the AEAD key; the label "quic iv" is used to derive the
Initialization Vector (IV).  The header protection key uses the "quic hp" label.
Using these labels provides key separation between QUIC and TLS; see
{{key-diversity}}.

The KDF used for initial secrets is always the HKDF-Expand-Label function from
TLS 1.3; see {{QUIC-TRANSPORT}}.


# Key Update

The Key Update Section of {{QUIC-TRANSPORT}} defines QUIC key updates.
This mechanism replaces the TLS KeyUpdate message.  Endpoints MUST NOT send a
TLS KeyUpdate message.  Endpoints MUST treat the receipt of a TLS KeyUpdate
message as a connection error of type 0x10a, equivalent to a fatal TLS alert of
unexpected_message (see {{tls-errors}}).

To initiate a key update, the endpoint creates a new write secret
from the existing write secret as performed in Section 7.2 of {{!TLS13}}.  This
uses the KDF function provided by TLS with a label of "quic ku".  The
corresponding key and IV are created from that secret as defined in
{{protection-keys}}.  The header protection key is not updated.

For example, to update write keys with TLS 1.3, HKDF-Expand-Label is used as:

~~~
secret_<n+1> = HKDF-Expand-Label(secret_<n>, "quic ku",
                                 "", Hash.length)
~~~


# QUIC-Specific Adjustments to the TLS Handshake

Certain aspects of the TLS handshake are different when used with QUIC.

QUIC also requires additional features from TLS.  In addition to negotiation of
cryptographic parameters, the TLS handshake carries and authenticates values for
QUIC transport parameters.


## Protocol Negotiation {#protocol-negotiation}

QUIC requires that the cryptographic handshake provide authenticated protocol
negotiation.  TLS uses Application Layer Protocol Negotiation
({{!ALPN=RFC7301}}) to select an application protocol.  Unless another mechanism
is used for agreeing on an application protocol, endpoints MUST use ALPN for
this purpose.

When using ALPN, endpoints MUST immediately close a connection (see Section
10.2 of {{QUIC-TRANSPORT}}) with a no_application_protocol TLS alert (QUIC error
code 0x178; see {{tls-errors}}) if an application protocol is not negotiated.
While {{!ALPN}} only specifies that servers use this alert, QUIC clients MUST
use error 0x178 to terminate a connection when ALPN negotiation fails.

An application protocol MAY restrict the QUIC versions that it can operate over.
Servers MUST select an application protocol compatible with the QUIC version
that the client has selected.  The server MUST treat the inability to select a
compatible application protocol as a connection error of type 0x178
(no_application_protocol).  Similarly, a client MUST treat the selection of an
incompatible application protocol by a server as a connection error of type
0x178.


## QUIC Transport Parameters Extension {#quic_parameters}

QUIC transport parameters are carried in a TLS extension. Different versions of
QUIC might define a different method for negotiating transport configuration.

Including transport parameters in the TLS handshake provides integrity
protection for these values.

~~~
   enum {
      quic_transport_parameters(0xffa5), (65535)
   } ExtensionType;
~~~

The extension_data field of the quic_transport_parameters extension contains a
value that is defined by the version of QUIC that is in use.

The quic_transport_parameters extension is carried in the ClientHello and the
EncryptedExtensions messages during the handshake. Endpoints MUST send the
quic_transport_parameters extension; endpoints that receive ClientHello or
EncryptedExtensions messages without the quic_transport_parameters extension
MUST close the connection with an error of type 0x16d (equivalent to a fatal TLS
missing_extension alert, see {{tls-errors}}).

While the transport parameters are technically available prior to the completion
of the handshake, they cannot be fully trusted until the handshake completes,
and reliance on them should be minimized.  However, any tampering with the
parameters will cause the handshake to fail.

Endpoints MUST NOT send this extension in a TLS connection that does not use
QUIC (such as the use of TLS with TCP defined in {{!TLS13}}).  A fatal
unsupported_extension alert MUST be sent by an implementation that supports this
extension if the extension is received when the transport is not QUIC.


## Removing the EndOfEarlyData Message {#remove-eoed}

The TLS EndOfEarlyData message is not used with QUIC.  QUIC does not rely on
this message to mark the end of 0-RTT data or to signal the change to Handshake
keys.

Clients MUST NOT send the EndOfEarlyData message.  A server MUST treat receipt
of a CRYPTO frame in a 0-RTT packet as a connection error of type
PROTOCOL_VIOLATION.

As a result, EndOfEarlyData does not appear in the TLS handshake transcript.


## Prohibit TLS Middlebox Compatibility Mode {#compat-mode}

Appendix D.4 of {{!TLS13}} describes an alteration to the TLS 1.3 handshake as
a workaround for bugs in some middleboxes. The TLS 1.3 middlebox compatibility
mode involves setting the legacy_session_id field to a 32-byte value in the
ClientHello and ServerHello, then sending a change_cipher_spec record. Both
field and record carry no semantic content and are ignored.

This mode has no use in QUIC as it only applies to middleboxes that interfere
with TLS over TCP. QUIC also provides no means to carry a change_cipher_spec
record. A client MUST NOT request the use of the TLS 1.3 compatibility mode. A
server SHOULD treat the receipt of a TLS ClientHello with a non-empty
legacy_session_id field as a connection error of type PROTOCOL_VIOLATION.


# Security Considerations

All of the security considerations that apply to TLS also apply to the use of
TLS in QUIC. Reading all of {{!TLS13}} and its appendices is the best way to
gain an understanding of the security properties of QUIC.

This section summarizes some of the more important security aspects specific to
the TLS integration, though there are many security-relevant details in the
remainder of the document.


## Session Linkability

Use of TLS session tickets allows servers and possibly other entities to
correlate connections made by the same client; see {{resumption}} for details.


## Key Diversity

In using TLS, the central key schedule of TLS is used.  As a result of the TLS
handshake messages being integrated into the calculation of secrets, the
inclusion of the QUIC transport parameters extension ensures that handshake and
1-RTT keys are not the same as those that might be produced by a server running
TLS over TCP.  To avoid the possibility of cross-protocol key synchronization,
additional measures are provided to improve key separation.

The QUIC packet protection keys and IVs are derived using a different label than
the equivalent keys in TLS.

To preserve this separation, a new version of QUIC SHOULD define new labels for
key derivation for packet protection key and IV, plus the header protection
keys.  This version of QUIC uses the string "quic".  Other versions can use a
version-specific label in place of that string.

The initial secrets use a key that is specific to the negotiated QUIC version.
New QUIC versions SHOULD define a new salt value used in calculating initial
secrets.


# IANA Considerations

This document does not create any new IANA registries, but it registers the
values in the following registries:

* TLS ExtensionType Values Registry {{!TLS-REGISTRIES=RFC8447}} - IANA is to
  register the quic_transport_parameters extension found in {{quic_parameters}}.
  The Recommended column is to be marked Yes.  The TLS 1.3 Column is to include
  CH and EE.


--- back

# Sample Packet Protection {#test-vectors}

This section shows examples of packet protection so that implementations can be
verified incrementally. Samples of Initial packets from both client and server,
plus a Retry packet are defined. These packets use an 8-byte client-chosen
Destination Connection ID of 0x8394c8f03e515708. Some intermediate values are
included. All values are shown in hexadecimal.


## Keys

The labels generated by the HKDF-Expand-Label function are:

client in:
: 00200f746c73313320636c69656e7420696e00

server in:
: 00200f746c7331332073657276657220696e00

quic key:
: 00100e746c7331332071756963206b657900

quic iv:
: 000c0d746c733133207175696320697600

quic hp:
: 00100d746c733133207175696320687000

The initial secret is common:

~~~
initial_secret = HKDF-Extract(initial_salt, cid)
    = 1e7e7764529715b1e0ddc8e9753c6157
      6769605187793ed366f8bbf8c9e986eb
~~~

The secrets for protecting client packets are:

~~~
client_initial_secret
    = HKDF-Expand-Label(initial_secret, "client in", _, 32)
    = 0088119288f1d866733ceeed15ff9d50
      902cf82952eee27e9d4d4918ea371d87

key = HKDF-Expand-Label(client_initial_secret, "quic key", _, 16)
    = 175257a31eb09dea9366d8bb79ad80ba

iv  = HKDF-Expand-Label(client_initial_secret, "quic iv", _, 12)
    = 6b26114b9cba2b63a9e8dd4f

hp  = HKDF-Expand-Label(client_initial_secret, "quic hp", _, 16)
    = 9ddd12c994c0698b89374a9c077a3077
~~~

The secrets for protecting server packets are:

~~~
server_initial_secret
    = HKDF-Expand-Label(initial_secret, "server in", _, 32)
    = 006f881359244dd9ad1acf85f595bad6
      7c13f9f5586f5e64e1acae1d9ea8f616

key = HKDF-Expand-Label(server_initial_secret, "quic key", _, 16)
    = 149d0b1662ab871fbe63c49b5e655a5d

iv  = HKDF-Expand-Label(server_initial_secret, "quic iv", _, 12)
    = bab2b12a4c76016ace47856d

hp  = HKDF-Expand-Label(server_initial_secret, "quic hp", _, 16)
    = c0c499a65a60024a18a250974ea01dfa
~~~


## Client Initial {#sample-client-initial}

The client sends an Initial packet.  The unprotected payload of this packet
contains the following CRYPTO frame, plus enough PADDING frames to make a 1162
byte payload:

~~~
060040f1010000ed0303ebf8fa56f129 39b9584a3896472ec40bb863cfd3e868
04fe3a47f06a2b69484c000004130113 02010000c000000010000e00000b6578
616d706c652e636f6dff01000100000a 00080006001d00170018001000070005
04616c706e0005000501000000000033 00260024001d00209370b2c9caa47fba
baf4559fedba753de171fa71f50f1ce1 5d43e994ec74d748002b000302030400
0d0010000e0403050306030203080408 050806002d00020101001c00024001ff
a500320408ffffffffffffffff050480 00ffff07048000ffff08011001048000
75300901100f088394c8f03e51570806 048000ffff
~~~

The unprotected header includes the connection ID and a 4-byte packet number
encoding for a packet number of 2:

~~~
c3ff00001d088394c8f03e5157080000449e00000002
~~~

Protecting the payload produces output that is sampled for header protection.
Because the header uses a 4-byte packet number encoding, the first 16 bytes of
the protected payload is sampled, then applied to the header:

~~~
sample = fb66bc6a93032b50dd8973972d149421

mask = AES-ECB(hp, sample)[0..4]
     = 1e9cdb9909

header[0] ^= mask[0] & 0x0f
     = cd
header[18..21] ^= mask[1..4]
     = 9cdb990b
header = cdff00001d088394c8f03e5157080000449e9cdb990b
~~~

The resulting protected packet is:

~~~
cdff00001f088394c8f03e5157080000 449e9cdb990bfb66bc6a93032b50dd89
73972d149421874d3849e3708d71354e a33bcdc356f3ea6e2a1a1bd7c3d14003
8d3e784d04c30a2cdb40c32523aba2da fe1c1bf3d27a6be38fe38ae033fbb071
3c1c73661bb6639795b42b97f77068ea d51f11fbf9489af2501d09481e6c64d4
b8551cd3cea70d830ce2aeeec789ef55 1a7fbe36b3f7e1549a9f8d8e153b3fac
3fb7b7812c9ed7c20b4be190ebd89956 26e7f0fc887925ec6f0606c5d36aa81b
ebb7aacdc4a31bb5f23d55faef5c5190 5783384f375a43235b5c742c78ab1bae
0a188b75efbde6b3774ed61282f9670a 9dea19e1566103ce675ab4e21081fb58
60340a1e88e4f10e39eae25cd685b109 29636d4f02e7fad2a5a458249f5c0298
a6d53acbe41a7fc83fa7cc01973f7a74 d1237a51974e097636b6203997f921d0
7bc1940a6f2d0de9f5a11432946159ed 6cc21df65c4ddd1115f86427259a196c
7148b25b6478b0dc7766e1c4d1b1f515 9f90eabc61636226244642ee148b464c
9e619ee50a5e3ddc836227cad938987c 4ea3c1fa7c75bbf88d89e9ada642b2b8
8fe8107b7ea375b1b64889a4e9e5c38a 1c896ce275a5658d250e2d76e1ed3a34
ce7e3a3f383d0c996d0bed106c2899ca 6fc263ef0455e74bb6ac1640ea7bfedc
59f03fee0e1725ea150ff4d69a7660c5 542119c71de270ae7c3ecfd1af2c4ce5
51986949cc34a66b3e216bfe18b347e6 c05fd050f85912db303a8f054ec23e38
f44d1c725ab641ae929fecc8e3cefa56 19df4231f5b4c009fa0c0bbc60bc75f7
6d06ef154fc8577077d9d6a1d2bd9bf0 81dc783ece60111bea7da9e5a9748069
d078b2bef48de04cabe3755b197d52b3 2046949ecaa310274b4aac0d008b1948
c1082cdfe2083e386d4fd84c0ed0666d 3ee26c4515c4fee73433ac703b690a9f
7bf278a77486ace44c489a0c7ac8dfe4 d1a58fb3a730b993ff0f0d61b4d89557
831eb4c752ffd39c10f6b9f46d8db278 da624fd800e4af85548a294c1518893a
8778c4f6d6d73c93df200960104e062b 388ea97dcf4016bced7f62b4f062cb6c
04c20693d9a0e3b74ba8fe74cc012378 84f40d765ae56a51688d985cf0ceaef4
3045ed8c3f0c33bced08537f6882613a cd3b08d665fce9dd8aa73171e2d3771a
61dba2790e491d413d93d987e2745af2 9418e428be34941485c93447520ffe23
1da2304d6a0fd5d07d08372202369661 59bef3cf904d722324dd852513df39ae
030d8173908da6364786d3c1bfcb19ea 77a63b25f1e7fc661def480c5d00d444
56269ebd84efd8e3a8b2c257eec76060 682848cbf5194bc99e49ee75e4d0d254
bad4bfd74970c30e44b65511d4ad0e6e c7398e08e01307eeeea14e46ccd87cf3
6b285221254d8fc6a6765c524ded0085 dca5bd688ddf722e2c0faf9d0fb2ce7a
0c3f2cee19ca0ffba461ca8dc5d2c817 8b0762cf67135558494d2a96f1a139f0
edb42d2af89a9c9122b07acbc29e5e72 2df8615c343702491098478a389c9872
a10b0c9875125e257c7bfdf27eef4060 bd3d00f4c14fd3e3496c38d3c5d1a566
8c39350effbc2d16ca17be4ce29f02ed 969504dda2a8c6b9ff919e693ee79e09
089316e7d1d89ec099db3b2b268725d8 88536a4b8bf9aee8fb43e82a4d919d48
395781bc0a3e8125b4dd506ca025eb37
~~~


## Server Initial

The server sends the following payload in response, including an ACK frame, a
CRYPTO frame, and no PADDING frames:

~~~
02000000000600405a020000560303ee fce7f7b37ba1d1632e96677825ddf739
88cfc79825df566dc5430b9a045a1200 130100002e00330024001d00209d3c94
0d89690b84d08a60993c144eca684d10 81287c834d5311bcf32bb9da1a002b00
020304
~~~

The header from the server includes a new connection ID and a 2-byte packet
number encoding for a packet number of 1:

~~~
c1ff00001d0008f067a5502a4262b50040740001
~~~

As a result, after protection, the header protection sample is taken starting
from the third protected octet:

~~~
sample = 823a5d3a1207c86ee49132824f046524
mask   = abaaf34fdc
header = caff00001d0008f067a5502a4262b5004074aaf2
~~~

The final protected packet is then:

~~~
c7ff00001f0008f067a5502a4262b500 4075fb12ff07823a5d24534d906ce4c7
6782a2167e3479c0f7f6395dc2c91676 302fe6d70bb7cbeb117b4ddb7d173498
44fd61dae200b8338e1b932976b61d91 e64a02e9e0ee72e3a6f63aba4ceeeec5
be2f24f2d86027572943533846caa13e 6f163fb257473d76f0e78487aca6427b
da2e7e70a7ee48
~~~


## Retry

This shows a Retry packet that might be sent in response to the Initial packet
in {{sample-client-initial}}. The integrity check includes the client-chosen
connection ID value of 0x8394c8f03e515708, but that value is not
included in the final Retry packet:

~~~
ffff00001f0008f067a5502a4262b574 6f6b656ec70ce5de430b4bdb7df1a383
3a75f986
~~~


## ChaCha20-Poly1305 Short Header Packet

This example shows some of the steps required to protect a packet with
a short header.  This example uses AEAD_CHACHA20_POLY1305.

In this example, TLS produces an application write secret from which a server
uses HKDF-Expand-Label to produce four values: a key, an IV, a header
protection key, and the secret that will be used after keys are updated (this
last value is not used further in this example).

~~~
secret
    = 9ac312a7f877468ebe69422748ad00a1
      5443f18203a07d6060f688f30f21632b

key = HKDF-Expand-Label(secret, "quic key", _, 32)
    = c6d98ff3441c3fe1b2182094f69caa2e
      d4b716b65488960a7a984979fb23e1c8

iv  = HKDF-Expand-Label(secret, "quic iv", _, 12)
    = e0459b3474bdd0e44a41c144

hp  = HKDF-Expand-Label(secret, "quic hp", _, 32)
    = 25a282b9e82f06f21f488917a4fc8f1b
      73573685608597d0efcb076b0ab7a7a4

ku  = HKDF-Expand-Label(secret, "quic ku", _, 32)
    = 1223504755036d556342ee9361d25342
      1a826c9ecdf3c7148684b36b714881f9
~~~

The following shows the steps involved in protecting a minimal packet with an
empty Destination Connection ID. This packet contains a single PING frame (that
is, a payload of just 0x01) and has a packet number of 654360564. In this
example, using a packet number of length 3 (that is, 49140 is encoded) avoids
having to pad the payload of the packet; PADDING frames would be needed if the
packet number is encoded on fewer octets.

~~~
pn                 = 654360564 (decimal)
nonce              = e0459b3474bdd0e46d417eb0
unprotected header = 4200bff4
payload plaintext  = 01
payload ciphertext = 655e5cd55c41f69080575d7999c25a5bfb
~~~

The resulting ciphertext is the minimum size possible. One byte is skipped to
produce the sample for header protection.

~~~
sample = 5e5cd55c41f69080575d7999c25a5bfb
mask   = aefefe7d03
header = 4cfe4189
~~~

The protected packet is the smallest possible packet size of 21 bytes.

~~~
packet = 4cfe4189655e5cd55c41f69080575d7999c25a5bfb
~~~


# Change Log

> **RFC Editor's Note:** Please remove this section prior to publication of a
> final version of this document.

Issue and pull request numbers are listed with a leading octothorp.

## Since draft-ietf-quic-tls-29

- Updated limits on packet protection (#3788, #3789)
- Allow for packet processing to continue while waiting for TLS to provide
  keys (#3821, #3874)

## Since draft-ietf-quic-tls-28

- Defined limits on the number of packets that can be protected with a single
  key and limits on the number of packets that can fail authentication (#3619,
  #3620)
- Update Initial salt, Retry keys, and samples (#3711)

## Since draft-ietf-quic-tls-27

- Allowed CONNECTION_CLOSE in any packet number space, with restrictions on
  use of the application-specific variant (#3430, #3435, #3440)
- Prohibit the use of the compatibility mode from TLS 1.3 (#3594, #3595)

## Since draft-ietf-quic-tls-26

- No changes

## Since draft-ietf-quic-tls-25

- No changes

## Since draft-ietf-quic-tls-24

- Rewrite key updates (#3050)
  - Allow but don't recommend deferring key updates (#2792, #3263)
  - More completely define received behavior (#2791)
  - Define the label used with HKDF-Expand-Label (#3054)

## Since draft-ietf-quic-tls-23

- Key update text update (#3050):
  - Recommend constant-time key replacement (#2792)
  - Provide explicit labels for key update key derivation (#3054)
- Allow first Initial from a client to span multiple packets (#2928, #3045)
- PING can be sent at any encryption level (#3034, #3035)


## Since draft-ietf-quic-tls-22

- Update the salt used for Initial secrets (#2887, #2980)


## Since draft-ietf-quic-tls-21

- No changes


## Since draft-ietf-quic-tls-20

- Mandate the use of the QUIC transport parameters extension (#2528, #2560)
- Define handshake completion and confirmation; define clearer rules when it
  encryption keys should be discarded (#2214, #2267, #2673)


## Since draft-ietf-quic-tls-18

- Increased the set of permissible frames in 0-RTT (#2344, #2355)
- Transport parameter extension is mandatory (#2528, #2560)


## Since draft-ietf-quic-tls-17

- Endpoints discard initial keys as soon as handshake keys are available (#1951,
  #2045)
- Use of ALPN or equivalent is mandatory (#2263, #2284)


## Since draft-ietf-quic-tls-14

- Update the salt used for Initial secrets (#1970)
- Clarify that TLS_AES_128_CCM_8_SHA256 isn't supported (#2019)
- Change header protection
  - Sample from a fixed offset (#1575, #2030)
  - Cover part of the first byte, including the key phase (#1322, #2006)
- TLS provides an AEAD and KDF function (#2046)
  - Clarify that the TLS KDF is used with TLS (#1997)
  - Change the labels for calculation of QUIC keys (#1845, #1971, #1991)
- Initial keys are discarded once Handshake keys are available (#1951, #2045)


## Since draft-ietf-quic-tls-13

- Updated to TLS 1.3 final (#1660)


## Since draft-ietf-quic-tls-12

- Changes to integration of the TLS handshake (#829, #1018, #1094, #1165, #1190,
  #1233, #1242, #1252, #1450)
  - The cryptographic handshake uses CRYPTO frames, not stream 0
  - QUIC packet protection is used in place of TLS record protection
  - Separate QUIC packet number spaces are used for the handshake
  - Changed Retry to be independent of the cryptographic handshake
  - Limit the use of HelloRetryRequest to address TLS needs (like key shares)
- Changed codepoint of TLS extension (#1395, #1402)


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


# Contributors
{:numbered="false"}

The IETF QUIC Working Group received an enormous amount of support from many
people. The following people provided substantive contributions to this
document:

- Adam Langley
- Alessandro Ghedini
- Christian Huitema
- Christopher Wood
- David Schinazi
- Dragana Damjanovic
- Eric Rescorla
- Felix Günther
- Ian Swett
- Jana Iyengar
- <t><t><contact asciiFullname="Kazuho Oku" fullname="奥 一穂"/></t></t>
- Marten Seemann
- Martin Duke
- Mike Bishop
- <t><t><contact fullname="Mikkel Fahnøe Jørgensen"/></t></t>
- Nick Banks
- Nick Harper
- Roberto Peon
- Rui Paulo
- Ryan Hamilton
- Victor Vasiliev

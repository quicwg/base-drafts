---
title: "QUIC: A UDP-Based Multiplexed and Secure Transport"
abbrev: QUIC Transport Protocol
docname: draft-ietf-quic-transport-latest
date: {DATE}
category: std
ipr: trust200902
area: Transport
workgroup: QUIC

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
  -
    ins: J. Iyengar
    name: Jana Iyengar
    org: Google
    email: jri@google.com
    role: editor
  -
    ins: M. Thomson
    name: Martin Thomson
    org: Mozilla
    email: martin.thomson@gmail.com
    role: editor

normative:

  QUIC-RECOVERY:
    title: "QUIC Loss Detection and Congestion Control"
    date: {DATE}
    author:
      -
        ins: J. Iyengar
        name: Jana Iyengar
        org: Google
        role: editor
      -
        ins: I. Swett
        name: Ian Swett
        org: Google
        role: editor

  QUIC-TLS:
    title: "Using Transport Layer Security (TLS) to Secure QUIC"
    date: {DATE}
    author:
      -
        ins: M. Thomson
        name: Martin Thomson
        org: Mozilla
        role: editor
      -
        ins: S. Turner, Ed.
        name: Sean Turner
        org: sn3rd
        role: editor

informative:

  QUIC-HTTP:
    title: "Hypertext Transfer Protocol (HTTP) over QUIC"
    date: {DATE}
    author:
      -
        ins: M. Bishop
        name: Mike Bishop
        org: Microsoft
        role: editor

  SST:
    title: "Structured Streams: A New Transport Abstraction"
    author:
      - ins: B. Ford
    date: 2007-08
    seriesinfo:
      ACM SIGCOMM 2007

  QUICCrypto:
    title: "QUIC Crypto"
    author:
      - ins: A. Langley
      - ins: W. Chang
    date: 2016-05-26
    target: "http://goo.gl/OuVSxa"

  EARLY-DESIGN:
    title: "QUIC: Multiplexed Transport Over UDP"
    author:
      - ins: J. Roskind
    date: 2013-12-02
    target: "https://goo.gl/dMVtFi"


--- abstract

QUIC is a multiplexed and secure transport protocol that runs on top of UDP.
QUIC builds on past transport experience, and implements mechanisms that make it
useful as a modern general-purpose transport protocol.  Using UDP as the basis
of QUIC is intended to address compatibility issues with legacy clients and
middleboxes.  QUIC authenticates all of its headers, preventing third parties
from changing them.  QUIC encrypts most of its headers, thereby limiting
protocol evolution to QUIC endpoints only.  Therefore, middleboxes, in large
part, are not required to be updated as new protocol versions are deployed.
This document describes the core QUIC protocol, including the conceptual design,
wire format, and mechanisms of the QUIC protocol for connection establishment,
stream multiplexing, stream and connection-level flow control, and data
reliability.  Accompanying documents describe QUIC's loss recovery and
congestion control, and the use of TLS 1.3 for key negotiation.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/transport>.

--- middle

# Introduction

QUIC is a multiplexed and secure transport protocol that runs on top of UDP.
QUIC builds on past transport experience and implements mechanisms that make it
useful as a modern general-purpose transport protocol.  Using UDP as the
substrate, QUIC seeks to be compatible with legacy clients and middleboxes.
QUIC authenticates all of its headers, preventing middleboxes and other third
parties from changing them, and encrypts most of its headers, limiting protocol
evolution largely to QUIC endpoints only.

This document describes the core QUIC protocol, including the conceptual design,
wire format, and mechanisms of the QUIC protocol for connection establishment,
stream multiplexing, stream and connection-level flow control, and data
reliability.  Accompanying documents describe QUIC's loss detection and
congestion control {{QUIC-RECOVERY}}, and the use of TLS 1.3 for key negotiation
{{QUIC-TLS}}.


# Conventions and Definitions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.

Definitions of terms that are used in this document:

* Client: The endpoint initiating a QUIC connection.

* Server: The endpoint accepting incoming QUIC connections.

* Endpoint: The client or server end of a connection.

* Stream: A logical, bi-directional channel of ordered bytes within
  a QUIC connection.

* Connection: A conversation between two QUIC endpoints with a
  single encryption context that multiplexes streams within it.

* Connection ID: The identifier for a QUIC connection.

* QUIC packet: A well-formed UDP payload that can be parsed by a
  QUIC receiver.  QUIC packet size in this document refers to the
  UDP payload size.

## Notational Conventions

Packet and frame diagrams use the format described in {{?RFC2360}} Section 3.1,
with the following additional conventions:

\[x\]
: Indicates that x is optional

\{x\}
: Indicates that x is encrypted

x (A)
: Indicates that x is A bits long

x (A/B/C) ...
: Indicates that x is one of A, B, or C bits long

x (*) ...
: Indicates that x is variable-length

# A QUIC Overview

This section briefly describes QUIC's key mechanisms and benefits.  Key
strengths of QUIC include:

* Low-latency connection establishment

* Multiplexing without head-of-line blocking

* Authenticated and encrypted header and payload

* Rich signaling for congestion control and loss recovery

* Stream and connection flow control

* Connection migration and resilience to NAT rebinding

* Version negotiation


## Low-Latency Connection Establishment

QUIC relies on a combined crypto and transport handshake for setting up a secure
transport connection.  QUIC connections are expected to commonly use 0-RTT
handshakes, meaning that for most QUIC connections, data can be sent immediately
following the client handshake packet, without waiting for a reply from the
server.  QUIC provides a dedicated stream (Stream ID 1) to be used for
performing the crypto handshake and QUIC options negotiation.  The format of the
QUIC options and parameters used during negotiation are described in this
document, but the handshake protocol that runs on Stream ID 1 is described in
the accompanying crypto handshake draft {{QUIC-TLS}}.

## Stream Multiplexing

When application messages are transported over TCP, independent application
messages can suffer from head-of-line blocking.  When an application multiplexes
many streams atop TCP's single-bytestream abstraction, a loss of a TCP segment
results in blocking of all subsequent segments until a retransmission arrives,
irrespective of the application streams that are encapsulated in subsequent
segments.  QUIC ensures that lost packets carrying data for an individual stream
only impact that specific stream.  Data received on other streams can continue
to be reassembled and delivered to the application.

## Rich Signaling for Congestion Control and Loss Recovery

QUIC's packet framing and acknowledgments carry rich information that help both
congestion control and loss recovery in fundamental ways.  Each QUIC packet
carries a new packet number, including those carrying retransmitted data.  This
obviates the need for a separate mechanism to distinguish acks for
retransmissions from those for original transmissions, avoiding TCP's
retransmission ambiguity problem.  QUIC acknowledgments also explicitly encode
the delay between the receipt of a packet and its acknowledgment being sent, and
together with the monotonically-increasing packet numbers, this allows for
precise network roundtrip-time (RTT) calculation.  QUIC's ACK frames support up
to 256 ack blocks, so QUIC is more resilient to reordering than TCP with SACK
support, as well as able to keep more bytes on the wire when there is reordering
or loss.

## Stream and Connection Flow Control

QUIC implements stream- and connection-level flow control, closely following
HTTP/2's flow control mechanisms.  At a high level, a QUIC receiver advertises
the absolute byte offset within each stream up to which the receiver is willing
to receive data.  As data is sent, received, and delivered on a particular
stream, the receiver sends WINDOW_UPDATE frames that increase the advertised
offset limit for that stream, allowing the peer to send more data on that
stream.  In addition to this stream-level flow control, QUIC implements
connection-level flow control to limit the aggregate buffer that a QUIC receiver
is willing to allocate to all streams on a connection.  Connection-level flow
control works in the same way as stream-level flow control, but the bytes
delivered and highest received offset are all aggregates across all streams.

## Authenticated and Encrypted Header and Payload

TCP headers appear in plaintext on the wire and are not authenticated, causing a
plethora of injection and header manipulation issues for TCP, such as
receive-window manipulation and sequence-number overwriting.  While some of
these are mechanisms used by middleboxes to improve TCP performance, others are
active attacks.  Even "performance-enhancing" middleboxes that routinely
interpose on the transport state machine end up limiting the evolvability of the
transport protocol, as has been observed in the design of MPTCP and in its
subsequent deployability issues.

Generally, QUIC packets are always authenticated and the payload is typically
fully encrypted.  The parts of the packet header which are not encrypted are
still authenticated by the receiver, so as to thwart any packet injection or
manipulation by third parties.  Some early handshake packets, such as the
Version Negotiation packet, are not encrypted, but information sent in these
unencrypted handshake packets is later verified under crypto cover.

PUBLIC_RESET packets that reset a connection are currently not authenticated.

## Connection Migration and Resilience to NAT Rebinding

QUIC connections are identified by a 64-bit Connection ID, randomly generated by
the client.  QUIC's consistent connection ID allows connections to survive
changes to the client's IP and port, such as those caused by NAT rebindings or
by the client changing network connectivity to a new address.  QUIC provides
automatic cryptographic verification of a rebound client, since the client
continues to use the same session key for encrypting and decrypting packets.
The consistent connection ID can be used to allow migration of the connection to
a new server IP address as well, since the Connection ID remains consistent
across changes in the client's and the server's network addresses.


## Version Negotiation {#benefit-version-negotiation}

QUIC version negotiation allows for multiple versions of the protocol to be
deployed and used concurrently. Version negotiation is described in
{{version-negotiation}}.


# Versions

QUIC versions are identified using a 32-bit value.

The version 0x00000000 is reserved to represent an invalid version.  This
version of the specification is identified by the number 0x00000001.

Versions with the most significant 16 bits of the version number cleared are
reserved for use in future IETF consensus documents.

\[\[RFC editor: please remove the remainder of this section before
publication.]]

The version number for the final version of this specification (0x00000001), is
reserved for the version of the protocol that is published as an RFC.

Version numbers used to identify IETF drafts are created by adding the draft
number to 0xff000000.  For example, draft-ietf-quic-transport-13 would be
identified as 0xff00000D.

Implementors are encouraged to register version numbers of QUIC that they
are using for private experimentation on the
[github wiki](https://github.com/quicwg/base-drafts/wiki/QUIC-Versions).


# Packet Types and Formats

We first describe QUIC's packet types and their formats, since some are
referenced in subsequent mechanisms.

All numeric values are encoded in network byte order (that is, big-endian) and
all field sizes are in bits.  When discussing individual bits of fields, the
least significant bit is referred to as bit 0.  Hexadecimal notation is used for
describing the value of fields.


## Common Header

All QUIC packets begin with a QUIC Common header, as shown below.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|   Flags (8)   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                     [Connection ID (64)]                      +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Type-Dependent Fields (*)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~

The fields in the Common Header are the following:

* Flags:

   * 0x01 = VERSION.  The semantics of this flag depends on whether the packet
     is sent by the server or the client.  A client MAY set this flag and
     include exactly one proposed version.  A server may set this flag when the
     client-proposed version was unsupported, and may then provide a list (0 or
     more) of acceptable versions as a part of version negotiation (described in
     {{version-negotiation}}.)

   * 0x02 = PUBLIC_RESET.  Set to indicate that the packet is a Public Reset
     packet.

   * 0x04 = KEY_PHASE.  This is used by the QUIC packet protection to identify
     the correct packet protection keys, see {{QUIC-TLS}}.

   * 0x08 = CONNECTION_ID.  Indicates the Connection ID is present in the
     packet.  This must be set in all packets until negotiated to a different
     value for a given direction.  For instance, if a client indicates that the
     5-tuple fully identifies the connection at the client, the connection ID is
     optional in the server-to-client direction. The negotiation is described in
     {{optional-transport-parameters}}.

   * 0x30 = PACKET_NUMBER_SIZE.  These two bits indicate the number of
     low-order-bytes of the packet number that are present in each packet.

     + 11 indicates that 6 bytes of the packet number are present
     + 10 indicates that 4 bytes of the packet number are present
     + 01 indicates that 2 bytes of the packet number are present
     + 00 indicates that 1 byte of the packet number is present

   * 0x40 = MULTIPATH.  This bit is reserved for multipath use.

   * 0x80 is currently unused, and must be set to 0.

* Connection ID: An unsigned 64-bit random number chosen by the client, used as
  the identifier of the connection.  Connection ID is tied to a QUIC connection,
  and remains consistent across client and/or server IP and port changes.


### Identifying Packet Types

While all QUIC packets have the same common header, there are three types of
packets: Regular packets, Version Negotiation packets, and Public Reset packets.
The flowchart below shows how a packet is classified into one of these three
packet types:

~~~
Check the flags in the common header
              |
              |
              V
        +--------------+
        | PUBLIC_RESET |  YES
        | flag set?    |-------> Public Reset packet
        +--------------+
              |
              | NO
              V
        +------------+         +-------------+
        | VERSION    |  YES    | Packet sent |  YES     Version
        | flag set?  |-------->| by server?  |--------> Negotiation
        +------------+         +-------------+          packet
              |                       |
              | NO                    | NO
              V                       V
      Regular packet with       Regular packet with
  no QUIC Version in header    QUIC Version in header
~~~
{: #packet-types title="Types of QUIC Packets"}


### Handling Packets from Different Versions

Version negotiation ({{version-negotiation}}) is performed using packets that
have the VERSION bit set.  This bit is always set on packets that are sent prior
to connection establishment.  When receiving a packet that is not associated
with an existing connection, packets without a VERSION bit MUST be discarded.

Implementations MUST assume that an unsupported version uses an unknown packet
format.

Between different versions the following things are guaranteed to remain
constant are:

* the location and size of the Flags field,

* the location and value of the VERSION bit in the Flags field,

* the location and size of the Connection ID field, and

* the Version (or Supported Versions, {{version-negotiation-packet}}) field.

All other values MUST be ignored when processing a packet that contains an
unsupported version.


## Regular Packets

Each Regular packet contains additional header fields followed by an encrypted
payload, as shown below:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        [Version (32)]                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                  Packet Number (8/16/32/48)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    {Encrypted Payload (*)}                  ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #regular-packet-format title="Regular Packet"}

The fields in a Regular packet past the Common Header are the following:

* QUIC Version: A 32-bit opaque tag that represents the version of the QUIC
  protocol.  Only present in the client-to-server direction, and if the VERSION
  flag is set.  Version Negotiation is described in {{version-negotiation}}.

* Packet Number: The lower 8, 16, 32, or 48 bits of the packet number, based on
  the PACKET_NUMBER_SIZE flag.  Each Regular packet is assigned a packet number
  by the sender.  The first packet sent by an endpoint MUST have a packet number
  of 1.

* Encrypted Payload: The remainder of a Regular packet is both authenticated and
  encrypted once packet protection keys are available.  {{QUIC-TLS}} describes
  packet protection in detail.  After decryption, the plaintext consists of a
  sequence of frames, as shown in {{regular-packet-frames}}.  Frames are
  described in {{frames}}.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Frame 1 (*)                        ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Frame 2 (*)                        ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                               ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Frame N (*)                        ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #regular-packet-frames title="Contents of Encrypted Payload"}

### Packet Number Compression and Reconstruction

The complete packet number is a 64-bit unsigned number and is used as part of a
cryptographic nonce for packet encryption.  To reduce the number of bits
required to represent the packet number over the wire, at most 48 bits of the
packet number are transmitted over the wire.  A QUIC endpoint MUST NOT reuse a
complete packet number within the same connection (that is, under the same
cryptographic keys).  If the total number of packets transmitted in this
connection reaches 2^64 - 1, the sender MUST close the connection by sending a
CONNECTION_CLOSE frame with the error code QUIC_SEQUENCE_NUMBER_LIMIT_REACHED
(connection termination is described in {{termination}}.)  For unambiguous
reconstruction of the complete packet number by a receiver from the lower-order
bits, a QUIC sender MUST NOT have more than 2^(packet_number_size - 2) in flight
at any point in the connection.  In other words,

* If a sender sets PACKET_NUMBER_SIZE bits to 11, it MUST NOT have more than
  (2^46) packets in flight.

* If a sender sets PACKET_NUMBER_SIZE bits to 10, it MUST NOT have more than
  (2^30) packets in flight.

* If a sender sets PACKET_NUMBER_SIZE bits to 01, it MUST NOT have more than
  (2^14) packets in flight.

* If a sender sets PACKET_NUMBER_SIZE bits to 00, it MUST NOT have more than
  (2^6) packets in flight.

  DISCUSS: Should the receiver be required to enforce this rule that the sender
  MUST NOT exceed the inflight limit?  Specifically, should the receiver drop
  packets that are received outside this window?

  Any truncated packet number received from a peer MUST be reconstructed as the
  value closest to the next expected packet number from that peer.

(TODO: Clarify how packet number size can change mid-connection.)

### Frames and Frame Types {#frames}

A Regular packet MUST contain at least one frame, and MAY contain multiple
frames and multiple frame types.  Frames MUST fit within a single QUIC packet
and MUST NOT span a QUIC packet boundary.  Each frame begins with a Frame Type
byte, indicating its type, followed by additional type-dependent fields:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Type (8)    |           Type-Dependent Fields (*)         ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #frame-layout title="Generic Frame Layout"}

The following table lists currently defined frame types.  Note that the Frame
Type byte in STREAM and ACK frames is used to carry other frame-specific flags.
For all other frames, the Frame Type byte simply identifies the frame.  These
frames are explained in more detail as they are referenced later in the
document.

+------------------|--------------------|----------------------------+
| Type-field value |     Frame type     | Definition                 |
+------------------|--------------------|----------------------------+
| 0x00             |  PADDING           | {{frame-padding}}          |
| 0x01             |  RST_STREAM        | {{frame-rst-stream}}       |
| 0x02             |  CONNECTION_CLOSE  | {{frame-connection-close}} |
| 0x03             |  GOAWAY            | {{frame-goaway}}           |
| 0x04             |  WINDOW_UPDATE     | {{frame-window-update}}    |
| 0x05             |  BLOCKED           | {{frame-blocked}}          |
| 0x06             |  STOP_WAITING      | {{frame-stop-waiting}}     |
| 0x07             |  PING              | {{frame-ping}}             |
| 0x40 - 0x7f      |  ACK               | {{frame-ack}}              |
| 0x80 - 0xff      |  STREAM            | {{frame-stream}}           |
+------------------|--------------------|----------------------------+

## Version Negotiation Packet

A Version Negotiation packet is only sent by the server, MUST have the VERSION
flag set, and MUST include the full 64-bit Connection ID.  The remainder of the
Version Negotiation packet is a list of 32-bit versions which the server
supports, as shown below.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Supported Version 1 (32)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Supported Version 2 (32)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                               ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Supported Version N (32)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #version-negotiation-format title="Version Negotiation Packet"}

## Public Reset Packet

A Public Reset packet MUST have the PUBLIC_RESET flag set, and MUST include the
full 64-bit connection ID.  The content of the Public Reset packet is TBD.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Public Reset Fields (*)                  ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #public-reset-format title="Public Reset Packet"}

# Life of a Connection

A QUIC connection is a single conversation between two QUIC endpoints.  QUIC's
connection establishment intertwines version negotiation with the crypto and
transport handshakes to reduce connection establishment latency, as described in
{{handshake}}.  Once established, a connection may migrate to a different IP or
port at either endpoint, due to NAT rebinding or mobility, as described in
{{migration}}.  Finally a connection may be terminated by either endpoint, as
described in {{termination}}.

## Version Negotiation {#version-negotiation}

QUIC's connection establishment begins with version negotiation, since all
communication between the endpoints, including packet and frame formats, relies
on the two endpoints agreeing on a version.

A QUIC connection begins with a client sending a handshake packet. The details
of the handshake mechanisms are described in {{handshake}}, but all of the
initial packets sent from the client to the server MUST have the VERSION flag
set, and MUST specify the version of the protocol being used.

When the server receives a packet from a client with the VERSION flag set, it
compares the client's version to the versions it supports.

If the version selected by the client is not acceptable to the server, the
server discards the incoming packet and responds with a version negotiation
packet ({{version-negotiation-packet}}).  This includes the VERSION flag and a
list of versions that the server will accept.  A server MUST send a version
negotiation packet for every packet that it receives with an unacceptable
version.

If the packet contains a version that is acceptable to the server, the server
proceeds with the handshake ({{handshake}}).  All subsequent packets sent by the
server MUST have the VERSION flag unset.  This commits the server to the version
that the client selected.

When the client receives a Version Negotiation packet from the server, it should
select an acceptable protocol version.  If the server lists an acceptable
version, the client selects that version and resends all packets using that
version. The resent packets MUST use new packet numbers.  These packets MUST
continue to have the VERSION flag set and MUST include the new negotiated
protocol version.

The client MUST set the VERSION flag and include its selected version on all
packets until it has 1-RTT keys and it has received a packet from the server
that does not have the VERSION flag set.  With TLS, this means that unprotected
packets and 0-RTT protected packets all include a version field.

A client MUST NOT change the version it uses unless it is in response to a
version negotiation packet from the server.  Once a client receives a packet
from the server with the VERSION flag unset, it MUST ignore the flag in
subsequently received packets.

Version negotiation uses unprotected data. The result of the negotiation MUST
be revalidated once the cryptographic handshake has completed (see
{{version-validation}}).

## Crypto and Transport Handshake {#handshake}

QUIC relies on a combined crypto and transport handshake to minimize connection
establishment latency.  QUIC provides a dedicated stream (Stream ID 1) to be
used for performing a combined connection and security handshake (streams are
described in detail in {{streams}}).  The crypto handshake protocol encapsulates
and delivers QUIC's transport handshake to the peer on the crypto stream.  The
first QUIC packet sent by client to the server MUST carry handshake information
as data on Stream ID 1.

### Transport Parameters and Options

During connection establishment, the handshake must negotiate various transport
parameters.  The currently defined transport parameters are described later in
the document.

The transport component of the handshake is responsible for exchanging and
negotiating the following parameters for a QUIC connection.  Not all parameters
are negotiated; some parameters are sent in just one direction.  These
parameters and options are encoded and handed off to the crypto handshake
protocol to be transmitted to the peer.

#### Encoding

(TODO: Describe format with example)

QUIC encodes the transport parameters and options as tag-value pairs, all as
7-bit ASCII strings.  QUIC parameter tags are listed below.

#### Required Transport Parameters {#required-transport-parameters}

* SFCW: Stream Flow Control Window.  The stream level flow control
  byte offset advertised by the sender of this parameter.

* CFCW: Connection Flow Control Window.  The connection level flow
  control byte offset advertised by the sender of this parameter.

* MSPC: Maximum number of incoming streams per connection.

* ICSL: Idle timeout in seconds.  The maximum value is 600 seconds (10 minutes).

#### Optional Transport Parameters {#optional-transport-parameters}

* TCID: Indicates support for truncated Connection IDs.  If sent by a peer,
  indicates that connection IDs sent to the peer should be truncated to 0 bytes.
  This is expected to commonly be used by an endpoint where the 5-tuple is
  sufficient to identify a connection.  For instance, if the 5-tuple is unique
  at the client, the client MAY send a TCID parameter to the server.  When a
  TCID parameter is received, an endpoint MAY choose to not send the connection
  ID on subsequent packets.

* COPT: Connection Options are a repeated tag field.  The field contains any
  connection options being requested by the client or server.  These are
  typically used for experimentation and will evolve over time.  Example use
  cases include changing congestion control algorithms and parameters such as
  initial window.  (TODO: List connection options.)

### Proof of Source Address Ownership

Transport protocols commonly spend a round trip checking that a client owns the
transport address (IP and port) that it claims.  Verifying that a client can
receive packets sent to its claimed transport address protects against spoofing
of this information by malicious clients.

This technique is used primarily to avoid QUIC from being used for traffic
amplification attack.  In such an attack, a packet is sent to a server with
spoofed source address information that identifies a victim.  If a server
generates more or larger packets in response to that packet, the attacker can
use the server to send more data toward the victim than it would be able to send
on its own.

Several methods are used in QUIC to mitigate this attack.  Firstly, the initial
handshake packet from a client is padded to a moderately large size (TBD:
describe/reference how this size is selected).  This allows a server to send a
similar amount of data without validating ownership of an address (TBD: provide
limits on what amount of amplification is enough).

A server eventually confirms that a client has received its messages when the
cryptographic handshake successfully completes.  This might be either because
the server wishes to avoid the computational cost of completing the handshake,
or it might be that the size of the packets that are sent during the handshake
is too large.  This is especially important for 0-RTT, where the server might
wish to provide application data traffic - such as a response to a request - in
response to the data carried in the early data from the client.

To send additional data prior to completing the cryptographic handshake, the
server then needs to validate that the client owns the address that it claims.

Two tools are provided by TLS to enable validation of client source addresses:
the cookie in the HelloRetryRequest message, and the ticket in the
NewSessionTicket message.

The cookie extension in the TLS HelloRetryRequest message allows a server to
perform source address validation during the handshake.  As long as the cookie
cannot be successfully guessed by a client, the server can be assured that the
client received the HelloRetryRequest.

A server can use the HelloRetryRequest cookie in a stateless fashion by
encrypting the state it needs to verify ownership of the client address and
continue the handshake into the cookie.

The ticket in the TLS NewSessionTicket message allows a server to provide a
client with a similar sort of token.  When a client resumes a TLS connection -
whether or not 0-RTT is attempted - it includes the ticket in the handshake
message.  As with the HelloRetryRequest cookie, the server can include the state
in the ticket it needs to validate that the client owns the address.

A server can send a NewSessionTicket message at any time.  This allows it to
update the state that is included in the ticket.  This might be done to refresh
the ticket, or in response to changes in the state of a connection.

### Crypto Handshake Protocol Features

QUIC's current crypto handshake mechanism is documented in {{QUICCrypto}}.  QUIC
does not restrict itself to using a specific handshake protocol, so the details
of a specific handshake protocol are out of this document's scope.  If not
explicitly specified in the application mapping, TLS is assumed to be the
default crypto handshake protocol, as described in {{QUIC-TLS}}.  An application
that maps to QUIC MAY however specify an alternative crypto handshake protocol
to be used.

The following list of requirements and recommendations documents properties of
the current prototype handshake which should be provided by any handshake
protocol.

* The crypto handshake MUST ensure that the final negotiated key is distinct for
  every connection between two endpoints.

* Transport Negotiation: The crypto handshake MUST provide a mechanism for the
  transport component to exchange transport parameters and Source Address
  Tokens.  To avoid downgrade attacks, the transport parameters sent and
  received MUST be verified before the handshake completes successfully.

* Connection Establishment in 0-RTT: Since low-latency connection establishment
  is a critical feature of QUIC, the QUIC handshake protocol SHOULD attempt to
  achieve 0-RTT connection establishment latency for repeated connections
  between the same endpoints.

* Source Address Spoofing Defense: Since QUIC handles source address
  verification, the crypto protocol SHOULD NOT impose a separate source address
  verification mechanism.

* Server Config Update: A QUIC server may refresh the source-address token (STK)
  mid-connection, to update the information stored in the STK at the client and
  to extend the period over which 0-RTT connections can be established by the
  client.

* Certificate Compression: Early QUIC experience demonstrated that compressing
  certificates exchanged during a handshake is valuable in reducing latency.
  This additionally helps to reduce the amplification attack footprint when a
  server sends a large set of certificates, which is not uncommon with TLS.  The
  crypto protocol SHOULD compress certificates and any other information to
  minimize the number of packets sent during a handshake.


### Version Negotiation Validation {#version-validation}

The following information used during the QUIC handshake MUST be
cryptographically verified by the crypto handshake protocol:

* Client's originally proposed version in its first packet.

* Server's version list in it's Version Negotiation packet, if one was sent.


## Connection Migration {#migration}

QUIC connections are identified by their 64-bit Connection ID.  QUIC's
consistent connection ID allows connections to survive changes to the
client's IP and/or port, such as those caused by client or server
migrating to a new network.  QUIC also provides automatic
cryptographic verification of a client which has changed its IP
address because the client continues to use the same session key for
encrypting and decrypting packets.

DISCUSS: Simultaneous migration.  Is this reasonable?

TODO: Perhaps move mitigation techniques from Security Considerations here.

## Connection Termination {#termination}

Connections should remain open until they become idle for a pre-negotiated
period of time.  A QUIC connection, once established, can be terminated in one
of three ways:

1. Explicit Shutdown: An endpoint sends a CONNECTION_CLOSE frame to
   initiate a connection termination.  An endpoint may send a GOAWAY frame to
   the peer prior to a CONNECTION_CLOSE to indicate that the connection will
   soon be terminated.  A GOAWAY frame signals to the peer that any active
   streams will continue to be processed, but the sender of the GOAWAY will not
   initiate any additional streams and will not accept any new incoming streams.
   On termination of the active streams, a CONNECTION_CLOSE may be sent.  If an
   endpoint sends a CONNECTION_CLOSE frame while unterminated streams are active
   (no FIN bit or RST_STREAM frames have been sent or received for one or more
   streams), then the peer must assume that the streams were incomplete and were
   abnormally terminated.

2. Implicit Shutdown: The default idle timeout for a QUIC connection is 30
   seconds, and is a required parameter (ICSL) in connection negotiation.  The
   maximum is 10 minutes.  If there is no network activity for the duration of
   the idle timeout, the connection is closed.  By default a CONNECTION_CLOSE
   frame will be sent.  A silent close option can be enabled when it is
   expensive to send an explicit close, such as mobile networks that must wake
   up the radio.

3. Abrupt Shutdown: An endpoint may send a Public Reset packet at any time
   during the connection to abruptly terminate an active connection.  A Public
   Reset packet SHOULD only be used as a final recourse.  Commonly, a public
   reset is expected to be sent when a packet on an established connection is
   received by an endpoint that is unable decrypt the packet.  For instance, if
   a server reboots mid-connection and loses any cryptographic state associated
   with open connections, and then receives a packet on an open connection, it
   should send a Public Reset packet in return.  (TODO: articulate rules around
   when a public reset should be sent.)

TODO: Connections that are terminated are added to a TIME_WAIT list at the
server, so as to absorb any straggler packets in the network.  Discuss TIME_WAIT
list.

# Frame Types and Formats

As described in {{packetization}}, Regular packets contain one or more frames.
We now describe the various QUIC frame types that can be present in a Regular
packet. The use of these frames and various frame header bits are described in
subsequent sections.

## STREAM Frame {#frame-stream}

STREAM frames implicitly create a stream and carry stream data. The type byte
for a STREAM frame contains embedded flags, and is formatted as `1FDOOOSS`.
These bits are parsed as follows:

* The leftmost bit must be set to 1, indicating that this is a STREAM frame.

* `F` is the FIN bit, which is used for stream termination.

* The `D` bit indicates whether a Data Length field is present in the STREAM
  header.  When set to 0, this field indicates that the Stream Data field
  extends to the end of the packet.  When set to 1, this field indicates that
  Data Length field contains the length (in bytes) of the Stream Data field.
  The option to omit the length should only be used when the packet is a
  "full-sized" packet, to avoid the risk of corruption via padding.

* The `OOO` bits encode the length of the Offset header field as 0, 16, 24,
  32, 40, 48, 56, or 64 bits long.

* The `SS` bits encode the length of the Stream ID header field as 8, 16, 24,
  or 32 bits.  (DISCUSS: Consider making this 8, 16, 32, 64.)

A STREAM frame is shown below.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Stream ID (8/16/24/32)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                Offset (0/16/24/32/40/48/56/64)              ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      [Data Length (16)]                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Stream Data (*)                      ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #stream-format title="STREAM Frame Format"}

The STREAM frame contains the following fields:

* Stream ID: A variable-sized unsigned ID unique to this stream.

* Offset: A variable-sized unsigned number specifying the byte offset in the
  stream for the data in this STREAM frame.  The first byte in the stream has an
  offset of 0.

* Data Length: An optional 16-bit unsigned number specifying the length of the
  Stream Data field in this STREAM frame.

* Stream Data: The bytes from the designated stream to be delivered.

A STREAM frame MUST have either non-zero data length or the FIN bit set.

Stream multiplexing is achieved by interleaving STREAM frames from multiple
streams into one or more QUIC packets.  A single QUIC packet MAY bundle STREAM
frames from multiple streams.

Implementation note: One of the benefits of QUIC is avoidance of head-of-line
blocking across multiple streams.  When a packet loss occurs, only streams with
data in that packet are blocked waiting for a retransmission to be received,
while other streams can continue making progress.  Note that when data from
multiple streams is bundled into a single QUIC packet, loss of that packet
blocks all those streams from making progress.  An implementation is therefore
advised to bundle as few streams as necessary in outgoing packets without losing
transmission efficiency to underfilled packets.

## ACK Frame {#frame-ack}

Receivers send ACK frames to inform senders which packets they have received, as
well as which packets are considered missing.  The ACK frame contains between 1
and 256 ack blocks.  Ack blocks are ranges of acknowledged packets.

To limit the ACK blocks to the ones that haven't yet been received by the
sender, the sender periodically sends STOP_WAITING frames that signal the
receiver to stop acking packets below a specified sequence number, raising the
Least Unacked packet number at the receiver.  A sender of an ACK frame thus
reports only those ACK blocks between the received Least Unacked and the
reported Largest Acked packet numbers.  The endpoint SHOULD raise the Least
Unacked communicated via future STOP_WAITING frames to the most recently
received Largest Acked.

Unlike TCP SACKs, QUIC ACK blocks are irrevocable.  Once a packet is acked, even
if it does not appear in a future ACK frame, it is assumed to be acked.

A sender MAY intentionally skip packet numbers to introduce entropy into the
connection, to avoid opportunistic ack attacks.  The sender MUST close the
connection if an unsent packet number is acked.  The format of the ACK frame is
efficient at expressing blocks of missing packets; skipping packet numbers
between 1 and 255 effectively provides up to 8 bits of efficient entropy on
demand, which should be adequate protection against most opportunistic ack
attacks.

The type byte for a ACK frame contains embedded flags, and is formatted as
`01NULLMM`.  These bits are parsed as follows:

* The first two bits must be set to 01 indicating that this is an ACK frame.

* The `N` bit indicates whether the frame has more than 1 ack range (i.e.,
  whether the Ack Block Section contains a Num Blocks field).

* The `U` bit is unused and MUST be set to zero.

* The two `LL` bits encode the length of the Largest Acked field as 1, 2, 4,
  or 6 bytes long.

* The two `MM` bits encode the length of the Ack Block Length fields as 1, 2,
  4, or 6 bytes long.

An ACK frame is shown below.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                  Largest Acked (8/16/32/48)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        Ack Delay (16)         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|[Num Blocks(8)]|             Ack Block Section (*)           ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   NumTS (8)   |             Timestamp Section (*)           ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #ack-format title="ACK Frame Format"}

The fields in the ACK frame are as follows:

* Largest Acked: A variable-sized unsigned value representing the largest packet
  number the peer is acking in this packet (typically the largest that the peer
  has seen thus far.)

* Ack Delay: Time from when the largest acked packet, as indicated in the Largest Acked
  field, was received by this peer to when this ack was sent.

* Num Blocks (opt): An optional 8-bit unsigned value specifying the number of
  additional ack blocks (besides the required First Ack Block) in this ACK
  frame.  Only present if the 'N' flag bit is 1.

* Ack Block Section: Contains one or more blocks of packet numbers which have
  been successfully received.  See {{ack-block-section}}.

* Num Timestamps: An unsigned 8-bit number specifying the total number of
  <packet number, timestamp> pairs in the Timestamp Section.

* Timestamp Section: Contains zero or more timestamps reporting transit delay of
  received packets.  See {{timestamp-section}}.


### Ack Block Section {#ack-block-section}

The Ack Block Section contains between one and 256 blocks of packet numbers
which have been successfully received. If the Num Blocks field is absent, only
the First Ack Block length is present in this section. Otherwise, the Num Blocks
field indicates how many additional blocks follow the First Ack Block Length
field.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|              First Ack Block Length (8/16/32/48)            ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [Gap 1 (8)]  |       [Ack Block 1 Length (8/16/32/48)]     ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [Gap 2 (8)]  |       [Ack Block 2 Length (8/16/32/48)]     ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                             ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [Gap N (8)]  |       [Ack Block N Length (8/16/32/48)]     ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #ack-block-format title="Ack Block Section"}

The fields in the Ack Block Section are:

* First Ack Block Length: An unsigned packet number delta that indicates the
  number of contiguous additional packets being acked starting at the Largest
  Acked.

* Gap To Next Block (opt, repeated): An unsigned number specifying the number
  of contiguous missing packets from the end of the previous ack block to the
  start of the next.

* Ack Block Length (opt, repeated): An unsigned packet number delta that
  indicates the number of contiguous packets being acked starting after the
  end of the previous gap.  Along with the previous field, this field is
  repeated "Num Blocks" times.

### Timestamp Section {#timestamp-section}

The Timestamp Section contains between zero and 255 measurements of packet
receive times relative to the beginning of the connection.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
| [Delta LA (8)]|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    [First Timestamp (32)]                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|[Delta LA 1(8)]| [Time Since Previous 1 (16)]  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|[Delta LA 2(8)]| [Time Since Previous 2 (16)]  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                       ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|[Delta LA N(8)]| [Time Since Previous N (16)]  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #timestamp-format title="Timestamp Section"}

The fields in the Timestamp Section are:

* Delta Largest Acked (opt): An optional 8-bit unsigned packet number delta
  specifying the delta between the largest acked and the first packet whose
  timestamp is being reported.  In other words, this first packet number may
  be computed as (Largest Acked - Delta Largest Acked.)

* First Timestamp (opt): An optional 32-bit unsigned value specifying the time
  delta in microseconds, from the beginning of the connection to the arrival
  of the packet indicated by Delta Largest Acked.

* Delta Largest Acked 1..N (opt, repeated): (Same as above.)

* Time Since Previous Timestamp 1..N(opt, repeated): An optional 16-bit unsigned
  value specifying time delta from the previous reported timestamp.  It is
  encoded in the same format as the Ack Delay.  Along with the previous field,
  this field is repeated "Num Timestamps" times.

#### Time Format

DISCUSS_AND_REPLACE: Perhaps make this format simpler.

The time format used in the ACK frame above is a 16-bit unsigned float with 11
explicit bits of mantissa and 5 bits of explicit exponent, specifying time in
microseconds.  The bit format is loosely modeled after IEEE 754.  For example, 1
microsecond is represented as 0x1, which has an exponent of zero, presented in
the 5 high order bits, and mantissa of 1, presented in the 11 low order bits.
When the explicit exponent is greater than zero, an implicit high-order 12th bit
of 1 is assumed in the mantissa.  For example, a floating value of 0x800 has an
explicit exponent of 1, as well as an explicit mantissa of 0, but then has an
effective mantissa of 4096 (12th bit is assumed to be 1).  Additionally, the
actual exponent is one-less than the explicit exponent, and the value represents
4096 microseconds.  Any values larger than the representable range are clamped
to 0xFFFF.

## STOP_WAITING Frame {#frame-stop-waiting}

The STOP_WAITING frame (type=0x06) is sent to inform the peer that it should not
continue to wait for packets with packet numbers lower than a specified value.
The packet number is encoded in 1, 2, 4 or 6 bytes, using the same coding length
as is specified for the packet number for the enclosing packet's header
(specified in the QUIC Frame packet's Flags field.) The frame is as follows:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|               Least Unacked Delta (8/16/32/48)              ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #stop-waiting-format title="STOP_WAITING Frame Format"}

The STOP_WAITING frame contains a single field:

* Least Unacked Delta: A variable-length packet number delta with the same
  length as the packet header's packet number.  Subtract it from the complete
  packet number of the enclosing packet to determine the least unacked packet
  number.  The resulting least unacked packet number is the earliest packet for
  which the sender is still awaiting an ack.  If the receiver is missing any
  packets earlier than this packet, the receiver SHOULD consider those packets
  to be irrecoverably lost and MUST NOT report those packets as missing in
  subsequent acks.

## WINDOW_UPDATE Frame {#frame-window-update}

The WINDOW_UPDATE frame (type=0x04) informs the peer of an increase in an
endpoint's flow control receive window. The Stream ID can be zero, indicating
this WINDOW_UPDATE applies to the connection level flow control window, or
non-zero, indicating that the specified stream should increase its flow control
window. The frame is as follows:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Stream ID (32)                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                        Byte Offset (64)                       +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~

The fields in the WINDOW_UPDATE frame are as follows:

* Stream ID: ID of the stream whose flow control windows is being updated, or 0
  to specify the connection-level flow control window.

* Byte offset: A 64-bit unsigned integer indicating the absolute byte offset of
  data which can be sent on the given stream.  In the case of connection-level
  flow control, the cumulative offset which can be sent on all streams that
  contribute to connection-level flow control.

## BLOCKED Frame {#frame-blocked}

A sender sends a BLOCKED frame (type=0x05) when it is ready to send data (and
has data to send), but is currently flow control blocked. BLOCKED frames are
purely informational frames, but extremely useful for debugging purposes. A
receiver of a BLOCKED frame should simply discard it (after possibly printing a
helpful log message). The frame is as follows:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Stream ID (32)                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~

The BLOCKED frame contains a single field:

* Stream ID: A 32-bit unsigned number indicating the stream which is flow
  control blocked.  A non-zero Stream ID field specifies the stream that is flow
  control blocked.  When zero, the Stream ID field indicates that the connection
  is flow control blocked.

## RST_STREAM Frame {#frame-rst-stream}

An endpoint may use a RST_STREAM frame (type=0x01) to abruptly terminate a
stream.  The frame is as follows:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Error Code (32)                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Stream ID (32)                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                       Final Offset (64)                       +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~

The fields are:

* Error code: A 32-bit error code which indicates why the stream is being
  closed.

* Stream ID: The 32-bit Stream ID of the stream being terminated.

* Final offset: A 64-bit unsigned integer indicating the absolute byte offset of
  the end of data written on this stream by the RST_STREAM sender.


## PADDING Frame {#frame-padding}

The PADDING frame (type=0x00) pads a packet with 0x00 bytes. When this frame is
encountered, the rest of the packet is expected to be padding bytes. The frame
contains 0x00 bytes and extends to the end of the QUIC packet. A PADDING frame
has no additional fields.


## PING frame {#frame-ping}

Endpoints can use PING frames (type=0x07) to verify that their peers are still
alive or to check reachability to the peer. The PING frame contains no
additional fields. The receiver of a PING frame simply needs to ACK the packet
containing this frame. The PING frame SHOULD be used to keep a connection alive
when a stream is open. The default is to send a PING frame after 15 seconds of
quiescence. A PING frame has no additional fields.


## CONNECTION_CLOSE frame {#frame-connection-close}

An endpoint sends a CONNECTION_CLOSE frame (type=0x02) to notify its peer that
the connection is being closed.  If there are open streams that haven't been
explicitly closed, they are implicitly closed when the connection is closed.
(Ideally, a GOAWAY frame would be sent with enough time that all streams are
torn down.)  The frame is as follows:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Error Code (32)                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Reason Phrase Length (16)   |      [Reason Phrase (*)]    ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~

The fields of a CONNECTION_CLOSE frame are as follows:

* Error Code: A 32-bit error code which indicates the reason for closing this
  connection.

* Reason Phrase Length: A 16-bit unsigned number specifying the length of the
  reason phrase.  This may be zero if the sender chooses to not give details
  beyond the Error Code.

* Reason Phrase: An optional human-readable explanation for why the connection
  was closed.

## GOAWAY Frame {#frame-goaway}

An endpoint may use a GOAWAY frame (type=0x03) to notify its peer that the
connection should stop being used, and will likely be closed in the future. The
endpoints will continue using any active streams, but the sender of the GOAWAY
will not initiate any additional streams, and will not accept any new streams.
The frame is as follows:

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Error Code (32)                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Last Good Stream ID (32)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Reason Phrase Length (16)   |      [Reason Phrase (*)]    ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~

The fields of a GOAWAY frame are as follows:

* Error Code: A 32-bit field error code which indicates the reason for closing
  this connection.

* Last Good Stream ID: The last Stream ID which was accepted by the sender of
  the GOAWAY message.  If no streams were replied to, this value must be set to
  0.

* Reason Phrase Length: A 16-bit unsigned number specifying the length of the
  reason phrase.  This may be zero if the sender chooses to not give details
  beyond the error code.

* Reason Phrase: An optional human-readable explanation for why the connection
  was closed.

# Packetization and Reliability {#packetization}

The maximum packet size for QUIC is the maximum size of the encrypted payload of
the resulting UDP datagram.  All QUIC packets SHOULD be sized to fit within the
path's MTU to avoid IP fragmentation.  The recommended default maximum packet
size is 1350 bytes for IPv6 and 1370 bytes for IPv4.  To optimize better,
endpoints MAY use PLPMTUD {{!RFC4821}} for detecting the path's MTU and setting
the maximum packet size appropriately.

A sender bundles one or more frames in a Regular QUIC packet.  A sender MAY
bundle any set of frames in a packet.  All QUIC packets MUST contain a packet
number and MAY contain one or more frames ({{frames}}).  Packet numbers MUST be
unique within a connection and MUST NOT be reused within the same connection.
Packet numbers MUST be assigned to packets in a strictly monotonically
increasing order.  The initial packet number used, at both the client and the
server, MUST be 0.  That is, the first packet in both directions of the
connection MUST have a packet number of 0.

A sender SHOULD minimize per-packet bandwidth and computational costs by
bundling as many frames as possible within a QUIC packet.  A sender MAY wait for
a short period of time to bundle multiple frames before sending a packet that is
not maximally packed, to avoid sending out large numbers of small packets.  An
implementation may use heuristics about expected application sending behavior to
determine whether and for how long to wait.  This waiting period is an
implementation decision, and an implementation should be careful to delay
conservatively, since any delay is likely to increase application-visible
latency.

Regular QUIC packets are "containers" of frames; a packet is never retransmitted
whole, but frames in a lost packet may be rebundled and transmitted in a
subsequent packet as necessary.

A packet may contain frames and/or application data, only some of which may
require reliability.  When a packet is detected as lost, the sender re-sends any
frames as necessary:

* All application data sent in STREAM frames MUST be retransmitted, with one
  exception.  When an endpoint sends a RST_STREAM frame, data outstanding on
  that stream SHOULD NOT be retransmitted, since subsequent data on this stream
  is expected to not be delivered by the receiver.

* ACK, STOP_WAITING, and PADDING frames MUST NOT be retransmitted.  New frames
  of these types may however be bundled with any outgoing packet.

* All other frames MUST be retransmitted.

Upon detecting losses, a sender MUST take appropriate congestion control action.
The details of loss detection and congestion control are described in
{{QUIC-RECOVERY}}.

A receiver acknowledges receipt of a received packet by sending one or more ACK
frames containing the packet number of the received packet.  To avoid perpetual
acking between endpoints, a receiver MUST NOT generate an ack in response to
every packet containing only ACK frames.  However, since it is possible that an
endpoint might only send packets containing ACK frames (or other
non-retransmittable frames), the receiving peer MAY send an ACK frame after a
reasonable number (currently 20) of such packets have been received.

Strategies and implications of the frequency of generating acknowledgments are
discussed in more detail in {{QUIC-RECOVERY}}.

# Streams: QUIC's Data Structuring Abstraction {#streams}

Streams in QUIC provide a lightweight, ordered, and bidirectional byte-stream
abstraction modeled closely on HTTP/2 streams {{?RFC7540}}

Streams can be created either by the client or the server, can concurrently send
data interleaved with other streams, and can be cancelled.

Data that is received on a stream is delivered in order within that stream, but
there is no particular delivery order across streams.  Transmit ordering among
streams is left to the implementation.

The creation and destruction of streams are expected to have minimal bandwidth
and computational cost.  A single STREAM frame may create, carry data for, and
terminate a stream, or a stream may last the entire duration of a connection.

Streams are individually flow controlled, allowing an endpoint to limit memory
commitment and to apply back pressure.

An alternative view of QUIC streams is as an elastic "message" abstraction,
similar to the way ephemeral streams are used in SST {{SST}}, which may be a
more appealing description for some applications.

## Life of a Stream

The semantics of QUIC streams is based on HTTP/2 streams, and the lifecycle of a
QUIC stream therefore closely follows that of an HTTP/2 stream {{?RFC7540}},
with some differences to accommodate the possibility of out-of-order delivery
due to the use of multiple streams in QUIC.  The lifecycle of a QUIC stream is
shown in the following figure and described below.

~~~
                        app     +--------+
                 reserve_stream |        |
                 ,--------------|  idle  |
                /               |        |
               /                +--------+
              V                      |
        +----------+ send data/      |
        |          | recv data       | send data/
    ,---| reserved |------------.    | recv data
    |   |          |             \   |
    |   +----------+              v  v
    |               recv FIN/   +--------+ send FIN/
    |            app read_close |        | app write_close
    |                 ,---------|  open  |-----------.
    |                /          |        |            \
    |               v           +--------+             v
    |        +----------+            |             +----------+
    |        |   half   |            |             |   half   |
    |        |  closed  |            | send RST/   |  closed  |
    |        | (remote) |            | recv RST    | (local)  |
    |        +----------+            |             +----------+
    |            |                   |                    |
    |            | send FIN/         |          recv FIN/ |
    |            | app write_close/  |    app read_close/ |
    |            | send RST/         v          send RST/ |
    |            | recv RST     +--------+      recv RST  |
    | send RST/  `------------->|        |<---------------'
    | recv RST                  | closed |
    `-------------------------->|        |
                                +--------+

       send:   endpoint sends this frame
       recv:   endpoint receives this frame

       data: application data in a STREAM frame
       FIN: FIN flag in a STREAM frame
       RST: RST_STREAM frame

       app: application API signals to QUIC
       reserve_stream: causes a StreamID to be reserved for later use
       read_close: causes stream to be half-closed without receiving a FIN
       write_close: causes stream to be half-closed without sending a FIN
~~~
{: #stream-lifecycle title="Lifecycle of a stream"}

Note that this diagram shows stream state transitions and the frames and flags
that affect those transitions only.  For the purpose of state transitions, the
FIN flag is processed as a separate event to the frame that bears it; a STREAM
frame with the FIN flag set can cause two state transitions.  When the FIN bit
is sent on an empty STREAM frame, the offset in the STREAM frame MUST be one
greater than the last data byte sent on this stream.

Both endpoints have a subjective view of the state of a stream that could be
different when frames are in transit.  Endpoints do not coordinate the creation
of streams; they are created unilaterally by either endpoint.  The negative
consequences of a mismatch in states are limited to the "closed" state after
sending RST_STREAM, where frames might be received for some time after closing.

Streams have the following states:

### idle

All streams start in the "idle" state.

The following transitions are valid from this state:

Sending or receiving a STREAM frame causes the stream to become "open".  The
stream identifier is selected as described in {{stream-identifiers}}.  The same
STREAM frame can also cause a stream to immediately become "half-closed".

An application can reserve an idle stream for later use.  The stream state for
the reserved stream transitions to "reserved".

Receiving any frame other than STREAM or RST_STREAM on a stream in this state
MUST be treated as a connection error ({{error-handling}}) of type YYYY.

### reserved

A stream in this state has been reserved for later use by the application.  In
this state only the following transitions are possible:

* Sending or receiving a STREAM frame causes the stream to become "open".

* Sending or receiving a RST_STREAM frame causes the stream to become "closed".

### open

A stream in the "open" state may be used by both peers to send frames of any
type.  In this state, a sending peer must observe the flow-control limit
advertised by its receiving peer ({{flow-control}}).

From this state, either endpoint can send a frame with the FIN flag set, which
causes the stream to transition into one of the "half-closed" states.  An
endpoint sending an FIN flag causes the stream state to become "half-closed
(local)".  An endpoint receiving a FIN flag causes the stream state to become
"half-closed (remote)"; the receiving endpoint MUST NOT process the FIN flag
until all preceding data on the stream has been received.

Either endpoint can send a RST_STREAM frame from this state, causing it to
transition immediately to "closed".

### half-closed (local)

A stream that is in the "half-closed (local)" state MUST NOT be used for sending
STREAM frames; WINDOW_UPDATE and RST_STREAM MAY be sent in this state.

A stream transitions from this state to "closed" when a frame that contains an
FIN flag is received or when either peer sends a RST_STREAM frame.

An endpoint that closes a stream MUST NOT send data beyond the final offset that
it has chosen, see {{state-closed}} for details.

An endpoint can receive any type of frame in this state.  Providing flow-control
credit using WINDOW_UPDATE frames is necessary to continue receiving
flow-controlled frames.  In this state, a receiver MAY ignore WINDOW_UPDATE
frames for this stream, which might arrive for a short period after a frame
bearing the FIN flag is sent.

### half-closed (remote)

A stream that is "half-closed (remote)" is no longer being used by the peer to
send any data.  In this state, a sender is no longer obligated to maintain a
receiver stream-level flow-control window.

A stream that is in the "half-closed (remote)" state will have a final offset
for received data, see {{state-closed}} for details.

A stream in this state can be used by the endpoint to send frames of any type.
In this state, the endpoint continues to observe advertised stream-level and
connection-level flow-control limits ({{flow-control}}).

A stream can transition from this state to "closed" by sending a frame that
contains a FIN flag or when either peer sends a RST_STREAM frame.

### closed {#state-closed}

The "closed" state is the terminal state.

An endpoint will learn the final offset of the data it receives on a stream when
it enters the "half-closed (remote)" or "closed" state.  The final offset is
carried explicitly in the RST_STREAM frame; otherwise, the final offset is the
offset of the end of the data carried in STREAM frame marked with a FIN flag.

An endpoint MUST NOT send data on a stream at or beyond the final offset.

Once a final offset for a stream is known, it cannot change.  If a RST_STREAM or
STREAM frame causes the final offset to change for a stream, an endpoint SHOULD
respond with a QUIC_STREAM_DATA_AFTER_TERMINATION error (see
{{error-handling}}).  A receiver SHOULD treat receipt of data at or beyond the
final offset as a QUIC_STREAM_DATA_AFTER_TERMINATION error.  Generating these
errors is not mandatory, but only because requiring that an endpoint generate
these errors also means that the endpoint needs to maintain the final offset
state for closed streams, which could mean a significant state commitment.

An endpoint that receives a RST_STREAM frame (and which has not sent a FIN or a
RST_STREAM) MUST immediately respond with a RST_STREAM frame, and MUST NOT send
any more data on the stream.  This endpoint may continue receiving frames for
the stream on which a RST_STREAM is received.

If this state is reached as a result of sending a RST_STREAM frame, the peer
that receives the RST_STREAM frame might have already sent -- or enqueued for
sending -- frames on the stream that cannot be withdrawn.  An endpoint MUST
ignore frames that it receives on closed streams after it has sent a RST_STREAM
frame. An endpoint MAY choose to limit the period over which it ignores frames
and treat frames that arrive after this time as being in error.

STREAM frames received after sending RST_STREAM are counted toward the
connection and stream flow-control windows.  Even though these frames might be
ignored, because they are sent before their sender receives the RST_STREAM, the
sender will consider the frames to count against its flow-control windows.

In the absence of more specific guidance elsewhere in this document,
implementations SHOULD treat the receipt of a frame that is not expressly
permitted in the description of a state as a connection error
({{error-handling}}). Frames of unknown types are ignored.

(TODO: QUIC_STREAM_NO_ERROR is a special case.  Write it up.)

## Stream Identifiers {#stream-identifiers}

Streams are identified by an unsigned 32-bit integer, referred to as the
StreamID.  To avoid StreamID collision, clients MUST initiate streams usinge
odd-numbered StreamIDs; streams initiated by the server MUST use even-numbered
StreamIDs.

A StreamID of zero (0x0) is reserved and used for connection-level flow control
frames ({{flow-control}}); the StreamID of zero cannot be used to establish a
new stream.

StreamID 1 (0x1) is reserved for the crypto handshake.  StreamID 1 MUST NOT be
used for application data, and MUST be the first client-initiated stream.

Streams MUST be created or reserved in sequential order, but MAY be used in
arbitrary order.  A QUIC endpoint MUST NOT reuse a StreamID on a given
connection.

## Stream Concurrency

An endpoint can limit the number of concurrently active incoming streams by
setting the MSPC parameter (see {{required-transport-parameters}}) in the
transport parameters. The maximum concurrent streams setting is specific to each
endpoint and applies only to the peer that receives the setting. That is,
clients specify the maximum number of concurrent streams the server can
initiate, and servers specify the maximum number of concurrent streams the
client can initiate.

Streams that are in the "open" state or in either of the "half-closed" states
count toward the maximum number of streams that an endpoint is permitted to
open.  Streams in any of these three states count toward the limit advertised in
the MSPC setting.

Endpoints MUST NOT exceed the limit set by their peer.  An endpoint that
receives a STREAM frame that causes its advertised concurrent stream limit to be
exceeded MUST treat this as a stream error of type QUIC_TOO_MANY_OPEN_STREAMS
({{error-handling}}).

## Sending and Receiving Data

Once a stream is created, endpoints may use the stream to send and receive data.
Each endpoint may send a series of STREAM frames encapsulating data on a stream
until the stream is terminated in that direction.  Streams are an ordered
byte-stream abstraction, and they have no other structure within them.  STREAM
frame boundaries are not expected to be preserved in retransmissions from the
sender or during delivery to the application at the receiver.

When new data is to be sent on a stream, a sender MUST set the encapsulating
STREAM frame's offset field to the stream offset of the first byte of this new
data.  The first byte of data that is sent on a stream has the stream offset 0.
A receiver MUST ensure that received stream data is delivered to the application
as an ordered byte-stream.  Data received out of order MUST be buffered for
later delivery, as long as it is not in violation of the receiver's flow control
limits.

The crypto handshake stream, Stream 1, MUST NOT be subject to congestion control
or connection-level flow control, but MUST be subject to stream-level flow
control. An endpoint MUST NOT send data on any other stream without consulting
the congestion controller and the flow controller.

Flow control is described in detail in {{flow-control}}, and congestion control
is described in the companion document {{QUIC-RECOVERY}}.


# Flow Control {#flow-control}

It is necessary to limit the amount of data that a sender may have outstanding
at any time, so as to prevent a fast sender from overwhelming a slow receiver,
or to prevent a malicious sender from consuming significant resources at a
receiver.  This section describes QUIC's flow-control mechanisms.

QUIC employs a credit-based flow-control scheme similar to HTTP/2's flow control
{{?RFC7540}}.  A receiver advertises the number of octets it is prepared to
receive on a given stream and for the entire connection.  This leads to two
levels of flow control in QUIC: (i) Connection flow control, which prevents
senders from exceeding a receiver's buffer capacity for the connection, and (ii)
Stream flow control, which prevents a single stream from consuming the entire
receive buffer for a connection.

A receiver sends WINDOW_UPDATE frames to the sender to advertise additional
credit by sending the absolute byte offset in the stream or in the connection
which it is willing to receive.

The initial flow control credit is 65536 bytes for both the stream and
connection flow controllers.

A receiver MAY advertise a larger offset at any point in the connection by
sending a WINDOW_UPDATE frame.  A receiver MUST NOT renege on an advertisement;
that is, once a receiver advertises an offset via a WINDOW_UPDATE frame, it MUST
NOT subsequently advertise a smaller offset.  A sender may receive WINDOW_UPDATE
frames out of order; a sender MUST therefore ignore any WINDOW_UPDATE that
does not move the window forward.

A receiver MUST close the connection with a
QUIC_FLOW_CONTROL_RECEIVED_TOO_MUCH_DATA error ({{error-handling}}) if the
peer violates the advertised stream or connection flow control windows.

A sender MUST send BLOCKED frames to indicate it has data to write but is
blocked by lack of connection or stream flow control credit.  BLOCKED frames are
expected to be sent infrequently in common cases, but they are considered useful
for debugging and monitoring purposes.

A receiver advertises credit for a stream by sending a WINDOW_UPDATE frame with
the StreamID set appropriately. A receiver may use the current offset of data
consumed to determine the flow control offset to be advertised.
A receiver MAY send copies of a WINDOW_UPDATE frame in multiple packets in order
to make sure that the sender receives it before running out of flow control
credit, even if one of the packets is lost.

Connection flow control is a limit to the total bytes of stream data sent in
STREAM frames on all streams contributing to connection flow control.  A
receiver advertises credit for a connection by sending a WINDOW_UPDATE frame
with the StreamID set to zero (0x00).  A receiver maintains a cumulative sum of
bytes received on all streams contributing to connection-level flow control, to
check for flow control violations. A receiver may maintain a cumulative sum of
bytes consumed on all contributing streams to determine the connection-level
flow control offset to be advertised.

## Edge Cases and Other Considerations

There are some edge cases which must be considered when dealing with stream and
connection level flow control.  Given enough time, both endpoints must agree on
flow control state.  If one end believes it can send more than the other end is
willing to receive, the connection will be torn down when too much data arrives.
Conversely if a sender believes it is blocked, while endpoint B expects more
data can be received, then the connection can be in a deadlock, with the sender
waiting for a WINDOW_UPDATE which will never come.

### Mid-stream RST_STREAM

On receipt of a RST_STREAM frame, an endpoint will tear down state for the
matching stream and ignore further data arriving on that stream.  This could
result in the endpoints getting out of sync, since the RST_STREAM frame may have
arrived out of order and there may be further bytes in flight.  The data sender
would have counted the data against its connection level flow control budget,
but a receiver that has not received these bytes would not know to include them
as well.  The receiver must learn the number of bytes that were sent on the
stream to make the same adjustment in its connection flow controller.

To avoid this de-synchronization, a RST_STREAM sender MUST include the final
byte offset sent on the stream in the RST_STREAM frame.  On receiving a
RST_STREAM frame, a receiver definitively knows how many bytes were sent on that
stream before the RST_STREAM frame, and the receiver MUST use the final offset
to account for all bytes sent on the stream in its connection level flow
controller.

### Response to a RST_STREAM

Since streams are bidirectional, a sender of a RST_STREAM needs to know how many
bytes the peer has sent on the stream.  If an endpoint receives a RST_STREAM
frame and has sent neither a FIN nor a RST_STREAM, it MUST send a RST_STREAM in
response, bearing the offset of the last byte sent on this stream as the final
offset.

### Offset Increment

This document leaves when and how many bytes to advertise in a WINDOW_UPDATE to
the implementation, but offers a few considerations.  WINDOW_UPDATE frames
constitute overhead, and therefore, sending a WINDOW_UPDATE with small offset
increments is undesirable.  At the same time, sending WINDOW_UPDATES with large
offset increments requires the sender to commit to that amount of buffer.
Implementations must find the correct tradeoff between these sides to determine
how large an offset increment to send in a WINDOW_UPDATE.

A receiver MAY use an autotuning mechanism to tune the size of the offset
increment to advertise based on a roundtrip time estimate and the rate at which
the receiving application consumes data, similar to common TCP implementations.

### BLOCKED frames

If a sender does not receive a WINDOW_UPDATE frame when it has run out of flow
control credit, the sender will be blocked and MUST send a BLOCKED frame.  A
BLOCKED frame is expected to be useful for debugging at the receiver.  A
receiver SHOULD NOT wait for a BLOCKED frame before sending a
WINDOW_UPDATE, since doing so will cause at least one roundtrip of quiescence.
For smooth operation of the congestion controller, it is generally considered
best to not let the sender go into quiescence if avoidable.  To avoid blocking a
sender, and to reasonably account for the possibiity of loss, a receiver should
send a WINDOW_UPDATE frame at least two roundtrips before it expects the sender
to get blocked.


# Error Codes {#error-handling}

Error codes are 32 bits long, with the first two bits indicating the source of
the error code:

0x00000000-0x3FFFFFFF:
: Application-specific error codes.  Defined by each application-layer protocol.

0x40000000-0x7FFFFFFF:
: Reserved for host-local error codes.  These codes MUST NOT be sent to a peer,
  but MAY be used in API return codes and logs.

0x80000000-0xBFFFFFFF:
: QUIC transport error codes, including packet protection errors.  Applicable to
  all uses of QUIC.

0xC0000000-0xFFFFFFFF:
: Cryptographic error codes.  Defined by the crypto handshake protocol in use.

This section lists the defined QUIC transport error codes that may be used in a
CONNECTION_CLOSE or RST_STREAM frame. Error codes share a common code space.
Some error codes apply only to either streams or the entire connection and have
no defined semantics in the other context.

QUIC_INTERNAL_ERROR (0x80000001):
: Connection has reached an invalid state.

QUIC_STREAM_DATA_AFTER_TERMINATION (0x80000002):
: There were data frames after the a fin or reset.

QUIC_INVALID_PACKET_HEADER (0x80000003):
: Control frame is malformed.

QUIC_INVALID_FRAME_DATA (0x80000004):
: Frame data is malformed.

QUIC_MISSING_PAYLOAD (0x80000030):
: The packet contained no payload.

QUIC_INVALID_STREAM_DATA (0x8000002E):
: STREAM frame data is malformed.

QUIC_OVERLAPPING_STREAM_DATA (0x80000057):
: STREAM frame data overlaps with buffered data.

QUIC_UNENCRYPTED_STREAM_DATA (0x8000003D):
: Received STREAM frame data is not encrypted.

QUIC_MAYBE_CORRUPTED_MEMORY (0x80000059):
: Received a frame which is likely the result of memory corruption.

QUIC_INVALID_RST_STREAM_DATA (0x80000006):
: RST_STREAM frame data is malformed.

QUIC_INVALID_CONNECTION_CLOSE_DATA (0x80000007):
: CONNECTION_CLOSE frame data is malformed.

QUIC_INVALID_GOAWAY_DATA (0x80000008):
: GOAWAY frame data is malformed.

QUIC_INVALID_WINDOW_UPDATE_DATA (0x80000039):
: WINDOW_UPDATE frame data is malformed.

QUIC_INVALID_BLOCKED_DATA (0x8000003A):
: BLOCKED frame data is malformed.

QUIC_INVALID_STOP_WAITING_DATA (0x8000003C):
: STOP_WAITING frame data is malformed.

QUIC_INVALID_PATH_CLOSE_DATA (0x8000004E):
: PATH_CLOSE frame data is malformed.

QUIC_INVALID_ACK_DATA (0x80000009):
: ACK frame data is malformed.

QUIC_INVALID_VERSION_NEGOTIATION_PACKET (0x8000000A):
: Version negotiation packet is malformed.

QUIC_INVALID_PUBLIC_RST_PACKET (0x8000000b):
: Public RST packet is malformed.

QUIC_DECRYPTION_FAILURE (0x8000000c):
: There was an error decrypting.

QUIC_ENCRYPTION_FAILURE (0x8000000d):
: There was an error encrypting.

QUIC_PACKET_TOO_LARGE (0x8000000e):
: The packet exceeded kMaxPacketSize.

QUIC_PEER_GOING_AWAY (0x80000010):
: The peer is going away. May be a client or server.

QUIC_INVALID_STREAM_ID (0x80000011):
: A stream ID was invalid.

QUIC_INVALID_PRIORITY (0x80000031):
: A priority was invalid.

QUIC_TOO_MANY_OPEN_STREAMS (0x80000012):
: Too many streams already open.

QUIC_TOO_MANY_AVAILABLE_STREAMS (0x8000004c):
: The peer created too many available streams.

QUIC_PUBLIC_RESET (0x80000013):
: Received public reset for this connection.

QUIC_INVALID_VERSION (0x80000014):
: Invalid protocol version.

QUIC_INVALID_HEADER_ID (0x80000016):
: The Header ID for a stream was too far from the previous.

QUIC_INVALID_NEGOTIATED_VALUE (0x80000017):
: Negotiable parameter received during handshake had invalid value.

QUIC_DECOMPRESSION_FAILURE (0x80000018):
: There was an error decompressing data.

QUIC_NETWORK_IDLE_TIMEOUT (0x80000019):
: The connection timed out due to no network activity.

QUIC_HANDSHAKE_TIMEOUT (0x80000043):
: The connection timed out waiting for the handshake to complete.

QUIC_ERROR_MIGRATING_ADDRESS (0x8000001a):
: There was an error encountered migrating addresses.

QUIC_ERROR_MIGRATING_PORT (0x80000056):
: There was an error encountered migrating port only.

QUIC_EMPTY_STREAM_FRAME_NO_FIN (0x80000032):
: We received a STREAM_FRAME with no data and no fin flag set.

QUIC_FLOW_CONTROL_RECEIVED_TOO_MUCH_DATA (0x8000003b):
: The peer received too much data, violating flow control.

QUIC_FLOW_CONTROL_SENT_TOO_MUCH_DATA (0x8000003f):
: The peer sent too much data, violating flow control.

QUIC_FLOW_CONTROL_INVALID_WINDOW (0x80000040):
: The peer received an invalid flow control window.

QUIC_CONNECTION_IP_POOLED (0x8000003e):
: The connection has been IP pooled into an existing connection.

QUIC_TOO_MANY_OUTSTANDING_SENT_PACKETS (0x80000044):
: The connection has too many outstanding sent packets.

QUIC_TOO_MANY_OUTSTANDING_RECEIVED_PACKETS (0x80000045):
: The connection has too many outstanding received packets.

QUIC_CONNECTION_CANCELLED (0x80000046):
: The QUIC connection has been cancelled.

QUIC_BAD_PACKET_LOSS_RATE (0x80000047):
: Disabled QUIC because of high packet loss rate.

QUIC_PUBLIC_RESETS_POST_HANDSHAKE (0x80000049):
: Disabled QUIC because of too many PUBLIC_RESETs post handshake.

QUIC_TIMEOUTS_WITH_OPEN_STREAMS (0x8000004a):
: Disabled QUIC because of too many timeouts with streams open.

QUIC_TOO_MANY_RTOS (0x80000055):
: QUIC timed out after too many RTOs.

QUIC_ENCRYPTION_LEVEL_INCORRECT (0x8000002c):
: A packet was received with the wrong encryption level (i.e. it should
  have been encrypted but was not.)

QUIC_VERSION_NEGOTIATION_MISMATCH (0x80000037):
: This connection involved a version negotiation which appears to have been
  tampered with.

QUIC_IP_ADDRESS_CHANGED (0x80000050):
: IP address changed causing connection close.

QUIC_TOO_MANY_FRAME_GAPS (0x8000005d):
: Stream frames arrived too discontiguously so that stream sequencer buffer
  maintains too many gaps.

QUIC_TOO_MANY_SESSIONS_ON_SERVER (0x80000060):
: Connection closed because server hit max number of sessions allowed.


# Security and Privacy Considerations

## Spoofed Ack Attack

An attacker receives an STK from the server and then releases the IP address on
which it received the STK.  The attacker may, in the future, spoof this same
address (which now presumably addresses a different endpoint), and initiate a
0-RTT connection with a server on the victim's behalf.  The attacker then spoofs
ACK frames to the server which cause the server to potentially drown the victim
in data.

There are two possible mitigations to this attack.  The simplest one is that a
server can unilaterally create a gap in packet-number space.  In the non-attack
scenario, the client will send an ack with a larger largest acked.  In the
attack scenario, the attacker may ack a packet in the gap.  If the server sees
an ack for a packet that was never sent, the connection can be aborted.

The second mitigation is that the server can require that acks for sent packets
match the encryption level of the sent packet.  This mitigation is useful if the
connection has an ephemeral forward-secure key that is generated and used for
every new connection.  If a packet sent is encrypted with a forward-secure key,
then any acks that are received for them must also be forward-secure encrypted.
Since the attacker will not have the forward secure key, the attacker will not
be able to generate forward-secure encrypted ack packets.


# IANA Considerations

This document has no IANA actions yet.


--- back

# Contributors

The original authors of this specification were Ryan Hamilton, Jana Iyengar, Ian
Swett, and Alyssa Wilk.

The original design and rationale behind this protocol draw significantly from
work by Jim Roskind {{EARLY-DESIGN}}. In alphabetical order, the contributors to
the pre-IETF QUIC project at Google are: Britt Cyr, Jeremy Dorfman, Ryan
Hamilton, Jana Iyengar, Fedor Kouranov, Charles Krasic, Jo Kulik, Adam Langley,
Jim Roskind, Robbie Shade, Satyam Shekhar, Cherie Shi, Ian Swett, Raman Tenneti,
Victor Vasiliev, Antonio Vicente, Patrik Westin, Alyssa Wilk, Dale Worley, Fan
Yang, Dan Zhang, Daniel Ziegler.

# Acknowledgments

Special thanks are due to the following for helping shape pre-IETF QUIC and its
deployment: Chris Bentzel, Misha Efimov, Roberto Peon, Alistair Riddoch,
Siddharth Vijayakrishnan, and Assar Westerlund.

This document has benefited immensely from various private discussions and
public ones on the quic@ietf.org and proto-quic@chromium.org mailing lists. Our
thanks to all.


# Change Log

> **RFC Editor's Note:**  Please remove this section prior to publication of a
> final version of this document.

## Since draft-ietf-quic-transport-00:

- Replaced DIVERSIFICATION_NONCE flag with KEY_PHASE flag

- Defined versioning

- Reworked description of packet and frame layout

- Error code space is divided into regions for each component

- Use big endian for all numeric values

## Since draft-hamilton-quic-transport-protocol-01:

- Adopted as base for draft-ietf-quic-tls.

- Updated authors/editors list.

- Added IANA Considerations section.

- Moved Contributors and Acknowledgments to appendices.

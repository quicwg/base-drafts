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
        ins: S. Turner
        name: Sean Turner
        org: sn3rd
        role: editor

informative:

  SST:
    title: "Structured Streams: A New Transport Abstraction"
    author:
      - ins: B. Ford
    date: 2007-08
    seriesinfo:
      ACM SIGCOMM 2007

  EARLY-DESIGN:
    title: "QUIC: Multiplexed Transport Over UDP"
    author:
      - ins: J. Roskind
    date: 2013-12-02
    target: "https://goo.gl/dMVtFi"


--- abstract

This document defines the core of the QUIC transport protocol.  This document
describes connection establishment, packet format, multiplexing and reliability.
Accompanying documents describe the cryptographic handshake and loss detection.


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
QUIC aims to provide a flexible set of features that allow it to be a
general-purpose transport for multiple applications.

QUIC implements techniques learned from experience with TCP, SCTP and other
transport protocols.  Using UDP as the substrate, QUIC seeks to be compatible
with legacy clients and middleboxes.  QUIC authenticates all of its headers and
encrypts most of the data it exchanges, including its signaling.  This allows
the protocol to evolve without incurring a dependency on upgrades to
middleboxes.

This document describes the core QUIC protocol, including the conceptual design,
wire format, and mechanisms of the QUIC protocol for connection establishment,
stream multiplexing, stream and connection-level flow control, and data
reliability.

Accompanying documents describe QUIC's loss detection and congestion control
{{QUIC-RECOVERY}}, and the use of TLS 1.3 for key negotiation {{QUIC-TLS}}.


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

QUIC relies on a combined cryptographic and transport handshake for
setting up a secure transport connection.  QUIC connections are
expected to commonly use 0-RTT handshakes, meaning that for most QUIC
connections, data can be sent immediately following the client
handshake packet, without waiting for a reply from the server.  QUIC
provides a dedicated stream (Stream ID 1) to be used for performing
the cryptographic handshake and QUIC options negotiation.  The format
of the QUIC options and parameters used during negotiation are
described in this document, but the handshake protocol that runs on
Stream ID 1 is described in the accompanying cryptographic handshake
draft {{QUIC-TLS}}.

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
obviates the need for a separate mechanism to distinguish acknowledgments for
retransmissions from those for original transmissions, avoiding TCP's
retransmission ambiguity problem.  QUIC acknowledgments also explicitly encode
the delay between the receipt of a packet and its acknowledgment being sent, and
together with the monotonically-increasing packet numbers, this allows for
precise network roundtrip-time (RTT) calculation.  QUIC's ACK frames support up
to 256 ACK blocks, so QUIC is more resilient to reordering than TCP with SACK
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
transport protocol, as has been observed in the design of MPTCP {{?RFC6824}} and
in its subsequent deployability issues.

Generally, QUIC packets are always authenticated and the payload is typically
fully encrypted.  The parts of the packet header which are not encrypted are
still authenticated by the receiver, so as to thwart any packet injection or
manipulation by third parties.  Some early handshake packets, such as the
Version Negotiation packet, are not encrypted, but information sent in these
unencrypted handshake packets is later verified as part of cryptographic
processing.

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

Versions that follow the pattern 0x?a?a?a?a are reserved for use in forcing
version negotiation to be exercised.  That is, any version number where the low
four bits of all octets is 1010 (in binary).  A client or server MAY advertise
support for any of these reserved versions.

Reserved version numbers will probably never represent a real protocol; a client
MAY use one of these version numbers with the expectation that the server will
initiate version negotiation; a server MAY advertise support for one of these
versions and can expect that clients ignore the value.

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
     {{transport-parameter-definitions}}.

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
  by the sender.  The first packet number is randomized (see
  {{initial-packet-number}}).

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


## Packet Numbers

The packet number is a 64-bit unsigned number and is used as part of a
cryptographic nonce for packet encryption.  Each endpoint maintains a separate
packet number for sending and receiving.  The packet number for sending MUST
increase by at least one after sending any packet.

A QUIC endpoint MUST NOT reuse a packet number within the same connection (that
is, under the same cryptographic keys).  If the packet number for sending
reaches 2^64 - 1, the sender MUST close the connection by sending a
CONNECTION_CLOSE frame with the error code QUIC_SEQUENCE_NUMBER_LIMIT_REACHED
(connection termination is described in {{termination}}.)

To reduce the number of bits required to represent the packet number over the
wire, only the least significant bits of the packet number are transmitted over
the wire, up to 48 bits.  The actual packet number for each packet is
reconstructed at the receiver based on the largest packet number received on a
successfully authenticated packet.

A packet number is decoded by finding the packet number value that is closest to
the next expected packet.  The next expected packet is the highest received
packet number plus one.  For example, if the highest successfully authenticated
packet had a packet number of 0xaa82f30e, then a packet containing a 16-bit
value of 0x1f94 will be decoded as 0xaa831f94.

To enable unambiguous reconstruction of the packet number, an endpoint MUST use
a packet number size that is able to represent 4 times more packet numbers than
the numerical difference between the current packet number and the lowest packet
number on an outstanding packet, plus one.  A packet is outstanding if it has
been sent but has neither been acknowledged nor been marked as lost (see
{{QUIC-RECOVERY}}).  As a result, the size of the packet number encoding is at
least two more than the base 2 logarithm of the range of outstanding packet
numbers including the new packet, rounded up.

For example, if an endpoint has is sending packet 0x6B4264 and 0x6B0A2F is the
lowest outstanding packet number, the next packet uses a 16-bit or larger packet
number encoding; whereas a 32-bit packet number is needed if packet 0x6AF0F7 is
outstanding.


### Initial Packet Number

The initial value for packet number MUST be a 31-bit random number.  That is,
the value is selected from an uniform random distribution between 0 and 2^31-1.
{{?RFC4086}} provides guidance on the generation of random values.

The first set of packets sent by an endpoint MUST include the low 32-bits of the
packet number.  Once any packet has been acknowledged, subsequent packets can
use a shorter packet number encoding.


## Frames and Frame Types {#frames}

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

|------------------|--------------------|----------------------------|
| Type-field value |     Frame type     | Definition                 |
|------------------|--------------------|----------------------------|
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
|------------------|--------------------|----------------------------|

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

A server that generates a version negotiation packet SHOULD include one of the
reserved version numbers (those following the pattern 0x?a?a?a?a).  This ensures
that clients are able to correctly handle an unsupported version.

The design of version negotiation permits a server to avoid maintaining state
for packets that it rejects in this fashion.  However, when the server generates
a version negotiation packet, it cannot randomly generate a reserved version
number.  This is because the server is required to include the same value in its
transport parameters (see {{version-validation}}).  To avoid the selected
version number changing during connection establishment, the reserved version
can be generated as a function of values that will be available to the server
when later generating its handshake packets.

A pseudorandom function that takes client address information (IP and port) and
the client selected version as input would ensure that there is sufficient
variability in the values that a server uses.

A client MAY send a packet using a reserved version number.  This can be used to
solicit a list of supported versions from a server.


## Public Reset Packet

A Public Reset packet MUST have the PUBLIC_RESET flag set, and MUST include the
full 64-bit connection ID.  The content of the Public Reset packet is TBD.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Public Reset Proof (*)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #public-reset-format title="Public Reset Packet"}

A Public Reset packet is used to abruptly terminate communications.  Public
Reset is provided as an option of last resort for endpoints that do not have
access to the state of a connection.  This is intended for use by an endpoint
that has lost state (for example, through a crash or outage), or middleboxes
that wish to indicate that a path is no longer usable.

Endpoints that wish to indicate fatal errors with a connection MUST use a
CONNECTION_CLOSE frame in preference to Public Reset if they have sufficient
state to do so.

Whether the Public Reset Proof field is included in a Public Reset packet
depends on the entity that generates the packet.

A Public Reset packet sent by an endpoint indicates that it does not have the
state necessary to continue with a connection.  In this case, the endpoint will
include the fields that prove that it originally participated in the connection
(see {{public-reset-proof}} for details).

Upon receipt of a Public Reset packet that contains a valid proof, an endpoint
MUST tear down state associated with the connection.  The endpoint MUST then
cease sending packets on the connection and SHOULD discard any subsequent
packets that arrive.  A Public Reset that does not contain a valid proof MUST be
ignored.


### Public Reset Proof

Details to be added.


# Life of a Connection

A QUIC connection is a single conversation between two QUIC endpoints.  QUIC's
connection establishment intertwines version negotiation with the cryptographic
and transport handshakes to reduce connection establishment latency, as
described in {{handshake}}.  Once established, a connection may migrate to a
different IP or port at either endpoint, due to NAT rebinding or mobility, as
described in {{migration}}.  Finally a connection may be terminated by either
endpoint, as described in {{termination}}.

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
server discards the incoming packet and responds with a Version Negotiation
packet ({{version-negotiation-packet}}).  This includes the VERSION flag and a
list of versions that the server will accept.  A server MUST send a Version
Negotiation packet for every packet that it receives with an unacceptable
version.

If the packet contains a version that is acceptable to the server, the server
proceeds with the handshake ({{handshake}}).  All subsequent packets sent by the
server MUST have the VERSION flag unset.  This commits the server to the version
that the client selected.

When the client receives a Version Negotiation packet from the server, it should
select an acceptable protocol version.  If the server lists an acceptable
version, the client selects that version and reattempts to created a connection
using that version.  Though the contents of a packet might not change in
response to version negotiation, a client MUST increase the packet number it
uses on every packet it sends.  Packets MUST continue to have the VERSION flag
set and MUST include the new negotiated protocol version.

The client MUST set the VERSION flag and include its selected version on all
packets until it has 1-RTT keys and it has received a packet from the server
that does not have the VERSION flag set.  With TLS, this means that unprotected
packets and 0-RTT protected packets all include a VERSION flag.

A client MUST NOT change the version it uses unless it is in response to a
Version Negotiation packet from the server.  Once a client receives a packet
from the server with the VERSION flag unset, it MUST ignore the flag in
subsequently received packets.

Version negotiation uses unprotected data. The result of the negotiation MUST
be revalidated once the cryptographic handshake has completed (see
{{version-validation}}).


## Cryptographic and Transport Handshake {#handshake}

QUIC relies on a combined cryptographic and transport handshake to minimize
connection establishment latency.  QUIC allocates stream 1 for the cryptographic
handshake.  This version of QUIC uses TLS 1.3 {{QUIC-TLS}}.

QUIC provides this stream with reliable, ordered delivery of data.  In return,
the cryptographic handshake provides QUIC with:

* authenticated key exchange, where

   * a server is always authenticated,

   * a client is optionally authenticated,

   * every connection produces distinct and unrelated keys,

   * keying material is usable for packet protection for both 0-RTT and 1-RTT
     packets, and

   * 1-RTT keys have forward secrecy

* authenticated values for the transport parameters of the peer (see
  {{transport-parameters}})

* authenticated confirmation of version negotiation (see {{version-validation}})

* authenticated negotiation of an application protocol (TLS uses ALPN
  {{?RFC7301}} for this purpose)

* for the server, the ability to carry data that provides assurance that the
  client can receive packets that are addressed with the transport address that
  is claimed by the client (see {{source-address-token}})

Details of how TLS is integrated with QUIC is provided in more detail in
{{QUIC-TLS}}.


## Transport Parameters

During connection establishment, both endpoints make authenticated declarations
of their transport parameters.  These declarations are made unilaterally by each
endpoint.  Endpoints are required to comply with the restrictions implied by
these parameters; the description of each parameter includes rules for its
handling.

The format of the transport parameters is the TransportParameters struct from
{{figure-transport-parameters}}.  This is described using the presentation
language from Section 3 of {{!I-D.ietf-tls-tls13}}.

~~~
   uint32 QuicVersion;

   enum {
      stream_fc_offset(0),
      connection_fc_offset(1),
      concurrent_streams(2),
      idle_timeout(3),
      truncate_connection_id(4),
      (65535)
   } TransportParameterId;

   struct {
      TransportParameterId parameter;
      opaque value<0..2^16-1>;
   } TransportParameter;

   struct {
      select (Handshake.msg_type) {
         case client_hello:
            QuicVersion negotiated_version;
            QuicVersion initial_version;

         case encrypted_extensions:
            QuicVersion supported_versions<2..2^8-4>;
      };
      TransportParameter parameters<30..2^16-1>;
   } TransportParameters;
~~~
{: #figure-transport-parameters title="Definition of TransportParameters"}

The `extension_data` field of the quic_transport_parameters extension defined in
{{QUIC-TLS}} contains a TransportParameters value.  TLS encoding rules are
therefore used to encode the transport parameters.

QUIC encodes transport parameters into a sequence of octets, which are then
included in the cryptographic handshake.  Once the handshake completes, the
transport parameters declared by the peer are available.  Each endpoint
validates the value provided by its peer.  In particular, version negotiation
MUST be validated (see {{version-validation}}) before the connection
establishment is considered properly complete.

Definitions for each of the defined transport parameters are included in
{{transport-parameter-definitions}}.


### Transport Parameter Definitions

An endpoint MUST include the following parameters in its encoded
TransportParameters:

stream_fc_offset (0x0000):

: The initial stream level flow control offset parameter is encoded as an
  unsigned 32-bit integer.  The sender of this parameter indicates that the flow
  control offset for all stream data sent toward it is this value.

connection_fc_offset (0x0001):

: The connection level flow control offset parameter contains the initial
  connection flow control window encoded as an unsigned 32-bit integer.  The
  sender of this parameter sets the byte offset for connection level flow
  control to this value.  This is equivalent to sending a WINDOW_UPDATE
  ({{frame-window-update}}) for stream 0 immediately after completing the
  handshake.

concurrent_streams (0x0002):

: The maximum number of concurrent streams parameter is encoded as an unsigned
  32-bit integer.

idle_timeout (0x0003):

: The idle timeout is a value in seconds that is encoded as an unsigned 16-bit
  integer.  The maximum value is 600 seconds (10 minutes).

An endpoint MAY use the following transport parameters:

truncate_connection_id (0x0004):

: The truncated connection identifier parameter indicates that packets sent to
  the peer can omit the connection ID.  This can be used by an endpoint where
  the 5-tuple is sufficient to identify a connection.  This parameter is zero
  length.  Omitting the parameter indicates that the endpoint relies on the
  connection ID being present in every packet.


### Values of Transport Parameters for 0-RTT

Transport parameters from the server SHOULD be remembered by the client for use
with 0-RTT data.  A client that doesn't remember values from a previous
connection can instead assume the following values: stream_fc_offset (65535),
connection_fc_offset (65535), concurrent_streams (10), idle_timeout (600),
truncate_connection_id (absent).

If assumed values change as a result of completing the handshake, the client is
expected to respect the new values.  This introduces some potential problems,
particularly with respect to transport parameters that establish limits:

* A client might exceed a newly declared connection or stream flow control limit
  with 0-RTT data.  If this occurs, the client ceases transmission as though the
  flow control limit was reached.  Once WINDOW_UPDATE frames indicating an
  increase to the affected flow control offsets is received, the client can
  recommence sending.

* Similarly, a client might exceed the concurrent stream limit declared by the
  server.  A client MUST reset any streams that exceed this limit.  A server
  SHOULD reset any streams it cannot handle with a code that allows the client
  to retry any application action bound to those streams.

A server MAY close a connection if remembered or assumed 0-RTT transport
parameters cannot be supported, using an error code that is appropriate to the
specific condition.  For example, a QUIC_FLOW_CONTROL_SENT_TOO_MUCH_DATA might
be used to indicate that exceeding flow control limits caused the error.  A
client that has a connection closed due to an error condition SHOULD NOT attempt
0-RTT when attempting to create a new connection.


### New Transport Parameters

New transport parameters can be used to negotiate new protocol behavior.  An
endpoint MUST ignore transport parameters that it does not support.  Absence of
a transport parameter therefore disables any optional protocol feature that is
negotiated using the parameter.

The definition of a transport parameter SHOULD include a default value that a
client can use when establishing a new connection.  If no default is specified,
the value can be assumed to be absent when attempting 0-RTT.

New transport parameters can be registered according to the rules in
{{iana-transport-parameters}}.


### Version Negotiation Validation {#version-validation}

The transport parameters include three fields that encode version information.
These retroactively authenticate the version negotiation (see
{{version-negotiation}}) that is performed prior to the cryptographic handshake.

The cryptographic handshake provides integrity protection for the negotiated
version as part of the transport parameters (see {{transport-parameters}}).  As
a result, modification of version negotiation packets by an attacker can be
detected.

The client includes two fields in the transport parameters:

* The negotiated_version is the version that was finally selected for use.  This
  MUST be identical to the value that is on the packet that carries the
  ClientHello.  A server that receives a negotiated_version that does not match
  the version of QUIC that is in use MUST terminate the connection with a
  QUIC_VERSION_NEGOTIATION_MISMATCH error code.

* The initial_version is the version that the client initially attempted to use.
  If the server did not send a version negotiation packet
  {{version-negotiation-packet}}, this will be identical to the
  negotiated_version.

A server that processes all packets in a stateful fashion can remember how
version negotiation was performed and validate the initial_version value.

A server that does not maintain state for every packet it receives (i.e., a
stateless server) uses a different process. If the initial and negotiated
versions are the same, a stateless server can accept the value.

If the initial version is different from the negotiated_version, a stateless
server MUST check that it would have sent a version negotiation packet if it had
received a packet with the indicated initial_version.  If a server would have
accepted the version included in the initial_version and the value differs from
the value of negotiated_version, the server MUST terminate the connection with a
QUIC_VERSION_NEGOTIATION_MISMATCH error.

The server includes a list of versions that it would send in any version
negotiation packet ({{version-negotiation-packet}}) in supported_versions.  This
value is set even if it did not send a version negotiation packet.

The client can validate that the negotiated_version is included in the
supported_versions list and - if version negotiation was performed - that it
would have selected the negotiated version.  A client MUST terminate the
connection with a QUIC_VERSION_NEGOTIATION_MISMATCH error code if the
negotiated_version value is not included in the supported_versions list.  A
client MUST terminate with a QUIC_VERSION_NEGOTIATION_MISMATCH error code if
version negotiation occurred but it would have selected a different version
based on the value of the supported_versions list.


## Proof of Source Address Ownership {#source-address-token}

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
handshake packet from a client is padded to at least 1280 octets.  This allows a
server to send a similar amount of data without risking causing an amplication
attack toward an unproven remote address.

A server eventually confirms that a client has received its messages when the
cryptographic handshake successfully completes.  This might be insufficient,
either because the server wishes to avoid the computational cost of completing
the handshake, or it might be that the size of the packets that are sent during
the handshake is too large.  This is especially important for 0-RTT, where the
server might wish to provide application data traffic - such as a response to a
request - in response to the data carried in the early data from the client.

To send additional data prior to completing the cryptographic handshake, the
server then needs to validate that the client owns the address that it claims.

Source address validation is therefore performed during the establishment of a
connection.  TLS provides the tools that support the feature, but basic
validation is performed by the core transport protocol.


### Client Address Validation Procedure

QUIC uses token-based address validation.  Any time the server wishes to
validate a client address, it provides the client with a token.  As long as the
token cannot be easily guessed (see {{token-integrity}}), if the client is able
to return that token, it proves to the server that it received the token.

During the processing of the cryptographic handshake messages from a client, TLS
will request that QUIC make a decision about whether to proceed based on the
information it has.  TLS will provide QUIC with any token that was provided by
the client.  For an initial packet, QUIC can decide to abort the connection,
allow it to proceed, or request address validation.

If QUIC decides to request address validation, it provides the cryptographic
handshake with a token.  The contents of this token are consumed by the server
that generates the token, so there is no need for a single well-defined format.
A token could include information about the claimed client address (IP and
port), a timestamp, and any other supplementary information the server will need
to validate the token in the future.

The cryptographic handshake is responsible for enacting validation by sending
the address validation token to the client.  A legitimate client will include a
copy of the token when it attempts to continue the handshake.  The cryptographic
handshake extracts the token then asks QUIC a second time whether the token is
acceptable.  In response, QUIC can either abort the connection or permit it to
proceed.

A connection MAY be accepted without address validation - or with only limited
validation - but a server SHOULD limit the data it sends toward an unvalidated
address.  Successful completion of the cryptographic handshake implicitly
provides proof that the client has received packets from the server.


### Address Validation on Session Resumption

A server MAY provide clients with an address validation token during one
connection that can be used on a subsequent connection.  Address validation is
especially important with 0-RTT because a server potentially sends a significant
amount of data to a client in response to 0-RTT data.

A different type of token is needed when resuming.  Unlike the token that is
created during a handshake, there might be some time between when the token is
created and when the token is subsequently used.  Thus, a resumption token
SHOULD include an expiration time.  It is also unlikely that the client port
number is the same on two different connections; validating the port is
therefore unlikely to be successful.

This token can be provided to the cryptographic handshake immediately after
establishing a connection.  QUIC might also generate an updated token if
significant time passes or the client address changes for any reason (see
{{migration}}).  The cryptographic handshake is responsible for providing the
client with the token.  In TLS the token is included in the ticket that is used
for resumption and 0-RTT, which is carried in a NewSessionTicket message.


### Address Validation Token Integrity {#token-integrity}

An address validation token MUST be difficult to guess.  Including a large
enough random value in the token would be sufficient, but this depends on the
server remembering the value it sends to clients.

A token-based scheme allows the server to offload any state associated with
validation to the client.  For this design to work, the token MUST be covered by
integrity protection against modification or falsification by clients.  Without
integrity protection, malicious clients could generate or guess values for
tokens that would be accepted by the server.  Only the server requires access to
the integrity protection key for tokens.

In TLS the address validation token is often bundled with the information that
TLS requires, such as the resumption secret.  In this case, adding integrity
protection can be delegated to the cryptographic handshake protocol, avoiding
redundant protection.  If integrity protection is delegated to the cryptographic
handshake, an integrity failure will result in immediate cryptographic handshake
failure.  If integrity protection is performed by QUIC, QUIC MUST abort the
connection if the integrity check fails with a QUIC_ADDRESS_VALIDATION_FAILURE
error code.


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
   seconds, and is a required parameter in connection negotiation.  The maximum
   is 10 minutes.  If there is no network activity for the duration of the idle
   timeout, the connection is closed.  By default a CONNECTION_CLOSE frame will
   be sent.  A silent close option can be enabled when it is expensive to send
   an explicit close, such as mobile networks that must wake up the radio.

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

As described in {{frames}}, Regular packets contain one or more frames.
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
|       [Data Length (16)]      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Stream ID (8/16/24/32)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                Offset (0/16/24/32/40/48/56/64)              ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Stream Data (*)                      ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #stream-format title="STREAM Frame Format"}

The STREAM frame contains the following fields:

Data Length:

: An optional 16-bit unsigned number specifying the length of the Stream Data
  field in this STREAM frame.  This field is present when the `D` bit is set to
  1.

Stream ID:

: A variable-sized unsigned ID unique to this stream.

Offset:

: A variable-sized unsigned number specifying the byte offset in the stream for
  the data in this STREAM frame.  The first byte in the stream has an offset of
  0.  The largest offset delivered on a stream - the sum of the re-constructed
  offset and data length - MUST be less than 2^64.

Stream Data:

: The bytes from the designated stream to be delivered.

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
and 256 ACK blocks.  ACK blocks are ranges of acknowledged packets.

To limit the ACK blocks to the ones that haven't yet been received by the
sender, the sender periodically sends STOP_WAITING frames that signal the
receiver to stop acknowledging packets below a specified sequence number,
raising the Least Unacked packet number at the receiver.  A sender of an ACK
frame thus reports only those ACK blocks between the received Least Unacked and
the reported Largest Acknowledged packet numbers.  The endpoint SHOULD raise the
Least Unacked communicated via future STOP_WAITING frames to the most recently
received Largest Acknowledged.

Unlike TCP SACKs, QUIC ACK blocks are cumulative and therefore irrevocable.
Once a packet has been acknowledged, even if it does not appear in a future ACK
frame, it is assumed to be acknowledged.

A sender MAY intentionally skip packet numbers to introduce entropy into the
connection, to avoid opportunistic acknowledgement attacks.  The sender MUST
close the connection if an unsent packet number is acknowledged.  The format of
the ACK frame is efficient at expressing blocks of missing packets; skipping
packet numbers between 1 and 255 effectively provides up to 8 bits of efficient
entropy on demand, which should be adequate protection against most
opportunistic acknowledgement attacks.

The type byte for a ACK frame contains embedded flags, and is formatted as
`01NULLMM`.  These bits are parsed as follows:

* The first two bits must be set to 01 indicating that this is an ACK frame.

* The `N` bit indicates whether the frame has more than 1 range of acknowledged
  packets (i.e., whether the ACK Block Section contains a Num Blocks field).

* The `U` bit is unused and MUST be set to zero.

* The two `LL` bits encode the length of the Largest Acknowledged field as 1, 2,
  4, or 6 bytes long.

* The two `MM` bits encode the length of the ACK Block Length fields as 1, 2,
  4, or 6 bytes long.

An ACK frame is shown below.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|[Num Blocks(8)]|   NumTS (8)   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                Largest Acknowledged (8/16/32/48)            ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        ACK Delay (16)         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     ACK Block Section (*)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Timestamp Section (*)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #ack-format title="ACK Frame Format"}

The fields in the ACK frame are as follows:

Num Blocks (opt):

: An optional 8-bit unsigned value specifying the number of additional ACK
  blocks (besides the required First ACK Block) in this ACK frame.  Only present
  if the 'N' flag bit is 1.

Num Timestamps:

: An unsigned 8-bit number specifying the total number of <packet number,
  timestamp> pairs in the Timestamp Section.

Largest Acknowledged:

: A variable-sized unsigned value representing the largest packet number the
  peer is acknowledging in this packet (typically the largest that the peer has
  seen thus far.)

ACK Delay:

: The time from when the largest acknowledged packet, as indicated in the
  Largest Acknowledged field, was received by this peer to when this ACK was
  sent.

ACK Block Section:

: Contains one or more blocks of packet numbers which have been successfully
  received, see {{ack-block-section}}.

Timestamp Section:

: Contains zero or more timestamps reporting transit delay of received packets.
  See {{timestamp-section}}.


### ACK Block Section {#ack-block-section}

The ACK Block Section contains between one and 256 blocks of packet numbers
which have been successfully received. If the Num Blocks field is absent, only
the First ACK Block length is present in this section. Otherwise, the Num Blocks
field indicates how many additional blocks follow the First ACK Block Length
field.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|              First ACK Block Length (8/16/32/48)            ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [Gap 1 (8)]  |       [ACK Block 1 Length (8/16/32/48)]     ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [Gap 2 (8)]  |       [ACK Block 2 Length (8/16/32/48)]     ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                             ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  [Gap N (8)]  |       [ACK Block N Length (8/16/32/48)]     ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #ack-block-format title="ACK Block Section"}

The fields in the ACK Block Section are:

First ACK Block Length:

: An unsigned packet number delta that indicates the number of contiguous
  additional packets being acknowledged starting at the Largest Acknowledged.

Gap To Next Block (opt, repeated):

: An unsigned number specifying the number of contiguous missing packets from
  the end of the previous ACK block to the start of the next.

ACK Block Length (opt, repeated):

: An unsigned packet number delta that indicates the number of contiguous
  packets being acknowledged starting after the end of the previous gap.  Along
  with the previous field, this field is repeated "Num Blocks" times.


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

Delta Largest Acknowledged (opt):

: An optional 8-bit unsigned packet number delta specifying the delta between
  the largest acknowledged and the first packet whose timestamp is being
  reported.  In other words, this first packet number may be computed as
  (Largest Acknowledged - Delta Largest Acknowledged.)

First Timestamp (opt):

: An optional 32-bit unsigned value specifying the time delta in microseconds,
  from the beginning of the connection to the arrival of the packet indicated by
  Delta Largest Acknowledged.

Delta Largest Acked 1..N (opt, repeated):

: (Same as above.)

Time Since Previous Timestamp 1..N(opt, repeated):

: An optional 16-bit unsigned value specifying time delta from the previous
  reported timestamp.  It is encoded in the same format as the ACK Delay.  Along
  with the previous field, this field is repeated "Num Timestamps" times.


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

Least Unacked Delta:

: A variable-length packet number delta with the same length as the packet
  header's packet number.  Subtract it from the complete packet number of the
  enclosing packet to determine the least unacked packet number.  The resulting
  least unacked packet number is the earliest packet for which the sender is
  still awaiting an ACK.  If the receiver is missing any packets earlier than
  this packet, the receiver SHOULD consider those packets to be irrecoverably
  lost and MUST NOT report those packets as missing in subsequent ACKs.


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

Stream ID:

: ID of the stream whose flow control windows is being updated, or 0 to specify
  the connection-level flow control window.

Byte offset:

: A 64-bit unsigned integer indicating the absolute byte offset of data which
  can be sent on the given stream.  In the case of connection-level flow
  control, the cumulative offset which can be sent on all streams that
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

Stream ID:

: A 32-bit unsigned number indicating the stream which is flow control blocked.
  A non-zero Stream ID field specifies the stream that is flow control blocked.
  When zero, the Stream ID field indicates that the connection is flow control
  blocked.


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

Error code:

: A 32-bit error code which indicates why the stream is being closed.

Stream ID:

: The 32-bit Stream ID of the stream being terminated.

Final offset:

: A 64-bit unsigned integer indicating the absolute byte offset of the end of
  data written on this stream by the RST_STREAM sender.


## PADDING Frame {#frame-padding}

The PADDING frame (type=0x00) has no semantic value.  PADDING frames can be used
to increase the size of a packet.  Padding can be used to increase an initial
client packet to the minimum required size, or to provide protection against
traffic analysis for protected packets.

A PADDING frame has no content.  That is, a PADDING frame consists of the single
octet that identifies the frame as a PADDING frame.


## PING frame {#frame-ping}

Endpoints can use PING frames (type=0x07) to verify that their peers are still
alive or to check reachability to the peer. The PING frame contains no
additional fields. The receiver of a PING frame simply needs to acknowledge the
packet containing this frame. The PING frame SHOULD be used to keep a connection
alive when a stream is open. The default is to send a PING frame after 15
seconds of quiescence. A PING frame has no additional fields.


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

Error Code:

: A 32-bit error code which indicates the reason for closing this connection.

Reason Phrase Length:

: A 16-bit unsigned number specifying the length of the reason phrase.  This may
  be zero if the sender chooses to not give details beyond the Error Code.

Reason Phrase:

: An optional human-readable explanation for why the connection was closed.


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

Error Code:

: A 32-bit field error code which indicates the reason for closing this
  connection.

Last Good Stream ID:

: The last Stream ID which was accepted by the sender of the GOAWAY message.  If
  no streams were replied to, this value must be set to 0.

Reason Phrase Length:

: A 16-bit unsigned number specifying the length of the reason phrase.  This may
  be zero if the sender chooses to not give details beyond the error code.

Reason Phrase:

: An optional human-readable explanation for why the connection was closed.


# Packetization and Reliability {#packetization}

The Path Maximum Transmission Unit (PTMU) is the maximum size of the entire IP
header, UDP header, and UDP payload. The UDP payload includes the QUIC public
header, encrypted payload, and any authentication fields.

All QUIC packets SHOULD be sized to fit within the estimated PMTU to avoid IP
fragmentation or packet drops. To optimize bandwidth efficiency, endpoints
SHOULD use Packetization Layer PMTU Discovery ({{!RFC4821}}) and MAY use PMTU
Discovery ({{!RFC1191}}, {{!RFC1981}}) for detecting the PMTU, setting the PMTU
appropriately, and storing the result of previous PMTU determinations.

In the absence of these mechanisms, QUIC endpoints SHOULD NOT send IP packets
larger than 1280 octets. Assuming the minimum IP header size, this results in
a UDP payload length of 1232 octets for IPv6 and 1252 octets for IPv4.

QUIC endpoints that implement any kind of PMTU discovery SHOULD maintain an
estimate for each combination of local and remote IP addresses (as each pairing
could have a different maximum MTU in the path).

QUIC depends on the network path supporting a MTU of at least 1280 octets. This
is the IPv6 minimum and therefore also supported by most modern IPv4 networks.
An endpoint MUST NOT reduce their MTU below this number, even if it receives
signals that indicate a smaller limit might exist.

Clients MUST ensure that the first packet in a connection, and any
retransmissions of those octets, has a total size (including IP and UDP headers)
of at least 1280 bytes. This might require inclusion of PADDING frames. It is
RECOMMENDED that a packet be padded to exactly 1280 octets unless the client has
a reasonable assurance that the PMTU is larger. Sending a packet of this size
ensures that the network path supports an MTU of this size and helps mitigate
amplification attacks caused by server responses toward an unverified client
address.

Servers MUST reject the first plaintext packet received from a client if it its
total size is less than 1280 octets, to mitigate amplification attacks.

If a QUIC endpoint determines that the PMTU between any pair of local and remote
IP addresses has fallen below 1280 octets, it MUST immediately cease sending
QUIC packets between those IP addresses. This may result in abrupt termination
of the connection if all pairs are affected. In this case, an endpoint SHOULD
send a Public Reset packet to indicate the failure. The application SHOULD
attempt to use TLS over TCP instead.

A sender bundles one or more frames in a Regular QUIC packet (see {{frames}}).

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
whole.  How an endpoint handles the loss of the frame depends on the type of the
frame.  Some frames are simply retransmitted, some have their contents moved to
new frames, and others are never retransmitted.

When a packet is detected as lost, the sender re-sends any frames as necessary:

* All application data sent in STREAM frames MUST be retransmitted, unless the
  endpoint has sent a RST_STREAM for that stream.  When an endpoint sends a
  RST_STREAM frame, data outstanding on that stream SHOULD NOT be retransmitted,
  since subsequent data on this stream is expected to not be delivered by the
  receiver.

* ACK, STOP_WAITING, and PADDING frames MUST NOT be retransmitted.  ACK and
  STOP_WAITING frames are cumulative, so new frames containing updated
  information will be sent as described in {{frame-ack}}.

* All other frames MUST be retransmitted.

Upon detecting losses, a sender MUST take appropriate congestion control action.
The details of loss detection and congestion control are described in
{{QUIC-RECOVERY}}.

A receiver acknowledges receipt of a received packet by sending one or more ACK
frames containing the packet number of the received packet.  To avoid perpetual
acknowledgment between endpoints, a receiver MUST NOT generate an ACK frame in
response to every packet containing only ACK frames.  However, since it is
possible that an endpoint might only send packets containing ACK frames (or
other non-retransmittable frames), the receiving peer MAY send an ACK frame
after a reasonable number (currently 20) of such packets have been received.

Strategies and implications of the frequency of generating acknowledgments are
discussed in more detail in {{QUIC-RECOVERY}}.

## Special Considerations for PMTU Discovery

Traditional ICMP-based path MTU discovery in IPv4 ({{!RFC1191}} is potentially
vulnerable to off-path attacks that successfully guess the IP/port 4-tuple and
reduce the MTU to a bandwidth-inefficient value. TCP connections mitigate this
risk by using the (at minimum) 8 bytes of transport header echoed in the ICMP
message to validate the TCP sequence number as valid for the current
connection. However, as QUIC operates over UDP, in IPv4 the echoed information
could consist only of the IP and UDP headers, which usually has insufficient
entropy to mitigate off-path attacks.

As a result, endpoints that implement PMTUD in IPv4 SHOULD take steps to
mitigate this risk. For instance, an application could:

* Set the IPv4 Don't Fragment (DF) bit on a small proportion of packets, so that
most invalid ICMP messages arrive when there are no DF packets outstanding, and
can therefore be identified as spurious.

* Store additional information from the IP or UDP headers from DF packets (for
example, the IP ID or UDP checksum) to further authenticate incoming Datagram
Too Big messages.

* Any reduction in PMTU due to a report contained in an ICMP packet is
provisional until QUIC's loss detection algorithm determines that the packet is
actually lost.

# Streams: QUIC's Data Structuring Abstraction {#streams}

Streams in QUIC provide a lightweight, ordered, and bidirectional byte-stream
abstraction modeled closely on HTTP/2 streams {{?RFC7540}}.

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
                            +--------+
                            |        |
                            |  idle  |
                            |        |
                            +--------+
                                 |
                                 | send data/
                                 | recv data/
                                 | recv higher stream
                                 |
                                 v
                            +--------+
                recv FIN    |        |    send FIN
                  ,---------|  open  |-----------.
                 /          |        |            \
                v           +--------+             v
         +----------+            |             +----------+
         |   half   |            |             |   half   |
         |  closed  |            | send RST/   |  closed  |
         | (remote) |            | recv RST    |  (local) |
         +----------+            |             +----------+
             |                   |                    |
             | send FIN/         |          recv FIN/ |
             | send RST/         v          send RST/ |
             | recv RST     +--------+      recv RST  |
             `------------->|        |<---------------'
                            | closed |
                            |        |
                            +--------+

   send:   endpoint sends this frame
   recv:   endpoint receives this frame

   data: application data in a STREAM frame
   FIN: FIN flag in a STREAM frame
   RST: RST_STREAM frame
~~~
{: #stream-lifecycle title="Lifecycle of a stream"}

Note that this diagram shows stream state transitions and the frames and flags
that affect those transitions only.  For the purpose of state transitions, the
FIN flag is processed as a separate event to the frame that bears it; a STREAM
frame with the FIN flag set can cause two state transitions.  When the FIN flag
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

Receiving a STREAM frame on a peer-initiated stream (that is, a packet sent by a
server on an even-numbered stream or a client packet on an odd-numbered stream)
also causes all lower-numbered "idle" streams in the same direction to become
"open".  This could occur if a peer begins sending on streams in a different
order to their creation, or it could happen if packets are lost or reordered in
transit.

Receiving any frame other than STREAM or RST_STREAM on a stream in this state
MUST be treated as a connection error ({{error-handling}}) of type YYYY.


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

StreamID 1 (0x1) is reserved for the cryptographic handshake.  StreamID 1 MUST
NOT be used for application data, and MUST be the first client-initiated stream.

A QUIC endpoint cannot reuse a StreamID on a given connection.  Streams MUST be
created in sequential order.  Open streams can be used in any order.  Streams
that are used out of order result in lower-numbered streams in the same
direction being counted as open.

All streams, including stream 1, count toward this limit.  Thus, a concurrent
stream limit of 0 will cause a connection to be unusable.  Application protocols
that use QUIC might require a certain minimum number of streams to function
correctly.  If a peer advertises an concurrent stream limit (concurrent_streams)
that is too small for the selected application protocol to function, an endpoint
MUST terminate the connection with an error of type QUIC_TOO_MANY_OPEN_STREAMS
({{error-handling}}).


## Stream Concurrency

An endpoint limits the number of concurrently active incoming streams by setting
the concurrent stream limit (see {{transport-parameter-definitions}}) in the
transport parameters. The maximum concurrent streams setting is specific to each
endpoint and applies only to the peer that receives the setting. That is,
clients specify the maximum number of concurrent streams the server can
initiate, and servers specify the maximum number of concurrent streams the
client can initiate.

Streams that are in the "open" state or in either of the "half-closed" states
count toward the maximum number of streams that an endpoint is permitted to
open.  Streams in any of these three states count toward the limit advertised in
the concurrent stream limit.

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
The largest offset delivered on a stream MUST be less than 2^64. A receiver
MUST ensure that received stream data is delivered to the application as an
ordered byte-stream.  Data received out of order MUST be buffered for later
delivery, as long as it is not in violation of the receiver's flow control
limits.

The cryptographic handshake stream, Stream 1, MUST NOT be subject to congestion
control or connection-level flow control, but MUST be subject to stream-level
flow control. An endpoint MUST NOT send data on any other stream without
consulting the congestion controller and the flow controller.

Flow control is described in detail in {{flow-control}}, and congestion control
is described in the companion document {{QUIC-RECOVERY}}.


## Stream Prioritization

Stream multiplexing has a significant effect on application performance if
resources allocated to streams are correctly prioritized.  Experience with other
multiplexed protocols, such as HTTP/2 {{?RFC7540}}, shows that effective
prioritization strategies have a significant positive impact on performance.

QUIC does not provide frames for exchanging priotization information.  Instead
it relies on receiving priority information from the application that uses QUIC.
Protocols that use QUIC are able to define any prioritization scheme that suits
their application semantics.  A protocol might define explicit messages for
signaling priority, such as those defined in HTTP/2; it could define rules that
allow an endpoint to determine priority based on context; or it could leave the
determination to the application.

A QUIC implementation SHOULD provide ways in which an application can indicate
the relative priority of streams.  When deciding which streams to dedicate
resources to, QUIC SHOULD use the information provided by the application.
Failure to account for priority of streams can result in suboptimal performance.

Stream priority is most relevant when deciding which stream data will be
transmitted.  Often, there will be limits on what can be transmitted as a result
of connection flow control or the current congestion controller state.

Giving preference to the transmission of its own management frames ensures that
the protocol functions efficiently.  That is, prioritizing frames other than
STREAM frames ensures that loss recovery, congestion control, and flow control
operate effectively.

Stream 1 MUST be prioritized over other streams prior to the completion of the
cryptographic handshake.  This includes the retransmission of the second flight
of client handshake messages, that is, the TLS Finished and any client
authentication messages.

STREAM frames that are determined to be lost SHOULD be retransmitted before
sending new data, unless application priorities indicate otherwise.
Retransmitting lost STREAM frames can fill in gaps, which allows the peer to
consume already received data and free up flow control window.


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


# Error Handling

An endpoint that detects an error SHOULD signal the existence of that error to
its peer.  Errors can affect an entire connection (see {{connection-errors}}),
or a single stream (see {{stream-errors}}).

The most appropriate error code ({{error-codes}}) SHOULD be included in the
frame that signals the error.  Where this specification identifies error
conditions, it also identifies the error code that is used.

Public Reset is not suitable for any error that can be signaled with a
CONNECTION_CLOSE or RST_STREAM frame.  Public Reset MUST NOT be sent by an
endpoint that has the state necessary to send a frame on the connection.


## Connection Errors

Errors that result in the connection being unusable, such as an obvious
violation of protocol semantics or corruption of state that affects an entire
connection, MUST be signaled using a CONNECTION_CLOSE frame
({{frame-connection-close}}). An endpoint MAY close the connection in this
manner, even if the error only affects a single stream.

A CONNECTION_CLOSE frame could be sent in a packet that is lost.  An endpoint
SHOULD be prepared to retransmit a packet containing a CONNECTION_CLOSE frame if
it receives more packets on a terminated connection.  Limiting the number of
retransmissions and the time over which this final packet is sent limits the
effort expended on terminated connections.

An endpoint that chooses not to retransmit packets containing CONNECTION_CLOSE
risks a peer missing the first such packet.  The only mechanism available to an
endpoint that continues to receive data for a terminated connection is to send a
Public Reset packet.


## Stream Errors

If the error affects a single stream, but otherwise leaves the connection in a
recoverable state, the endpoint can sent a RST_STREAM frame
({{frame-rst-stream}}) with an appropriate error code to terminate just the
affected stream.

Stream 1 is critical to the functioning of the entire connection.  If stream 1
is closed with either a RST_STREAM or STREAM frame bearing the FIN flag, an
endpoint MUST generate a connection error of type QUIC_CLOSED_CRITICAL_STREAM.

Some application protocols make other streams critical to that protocol.  An
application protocol does not need to inform the transport that a stream is
critical; it can instead generate appropriate errors in response to being
notified that the critical stream is closed.

An endpoint MAY send a RST_STREAM frame in the same packet as a CONNECTION_CLOSE
frame.


## Error Codes

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
: Cryptographic error codes.  Defined by the cryptographic handshake protocol
  in use.

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

QUIC_MULTIPLE_TERMINATION_OFFSETS (0x80000005):
: Multiple final offset values were received on the same stream

QUIC_STREAM_CANCELLED (0x80000006):
: The stream was cancelled

QUIC_CLOSED_CRITICAL_STREAM (0x80000007):
: A stream that is critical to the protocol was closed.

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

QUIC_ADDRESS_VALIDATION_FAILURE (0x80000051):
: Client address validation failed.

QUIC_TOO_MANY_FRAME_GAPS (0x8000005d):
: Stream frames arrived too discontiguously so that stream sequencer buffer
  maintains too many gaps.

QUIC_TOO_MANY_SESSIONS_ON_SERVER (0x80000060):
: Connection closed because server hit max number of sessions allowed.


# Security and Privacy Considerations

## Spoofed ACK Attack

An attacker receives an STK from the server and then releases the IP address on
which it received the STK.  The attacker may, in the future, spoof this same
address (which now presumably addresses a different endpoint), and initiate a
0-RTT connection with a server on the victim's behalf.  The attacker then spoofs
ACK frames to the server which cause the server to potentially drown the victim
in data.

There are two possible mitigations to this attack.  The simplest one is that a
server can unilaterally create a gap in packet-number space.  In the non-attack
scenario, the client will send an ACK frame with the larger value for largest
acknowledged.  In the attack scenario, the attacker could acknowledge a packet
in the gap.  If the server sees an acknowledgment for a packet that was never
sent, the connection can be aborted.

The second mitigation is that the server can require that acknowledgments for
sent packets match the encryption level of the sent packet.  This mitigation is
useful if the connection has an ephemeral forward-secure key that is generated
and used for every new connection.  If a packet sent is encrypted with a
forward-secure key, then any acknowledgments that are received for them MUST
also be forward-secure encrypted.  Since the attacker will not have the forward
secure key, the attacker will not be able to generate forward-secure encrypted
packets with ACK frames.


# IANA Considerations

## QUIC Transport Parameter Registry {#iana-transport-parameters}

IANA \[SHALL add/has added] a registry for "QUIC Transport Parameters" under a
"QUIC Protocol" heading.

The "QUIC Transport Parameters" registry governs a 16-bit space.  This space is
split into two spaces that are governed by different policies.  Values with the
first byte in the range 0x00 to 0xfe (in hexadecimal) are assigned via the
Specification Required policy {{!RFC5226}}.  Values with the first byte 0xff are
reserved for Private Use {{!RFC5226}}.

Registrations MUST include the following fields:

Value:

: The numeric value of the assignment (registrations will be between 0x0000 and
  0xfeff).

Parameter Name:

: A short mnemonic for the parameter.

Specification:

: A reference to a publicly available specification for the value.


The nominated expert(s) verify that a specification exists and is readily
accessible.  The expert(s) are encouraged to be biased towards approving
registrations unless they are abusive, frivolous, or actively harmful (not
merely aesthetically displeasing, or architecturally dubious).

The initial contents of this registry are shown in
{{iana-tp-table}}.

| Value | Parameter Name | Specification |
|:-|:-|:-|
| 0x0000 | stream_fc_offset | {{transport-parameter-definitions}} |
| 0x0001 | connection_fc_offset | {{transport-parameter-definitions}} |
| 0x0002 | concurrent_streams | {{transport-parameter-definitions}} |
| 0x0003 | idle_timeout | {{transport-parameter-definitions}} |
| 0x0004 | truncate_connection_id | {{transport-parameter-definitions}} |
{: #iana-tp-table title="Initial QUIC Transport Parameters Entries"}


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


## Since draft-ietf-quic-transport-01:

- Defined transport parameters


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

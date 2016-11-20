---
title: "QUIC: A UDP-Based Multiplexed and Secure Transport"
abbrev: QUIC Transport Protocol
docname: draft-ietf-quic-transport-protocol-latest
category: std
ipr: trust200902

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
 -
    ins: R. Hamilton
    name: Ryan Hamilton
    org: Google
    email: rch@google.com
 -
    ins: J. Iyengar
    name: Jana Iyengar
    org: Google
    email: jri@google.com
 -
    ins: I. Swett
    name: Ian Swett
    org: Google
    email: ianswett@google.com
 -
    ins: A. Wilk
    name: Alyssa Wilk
    org: Google
    email: alyssar@google.com

normative:


informative:


--- abstract

QUIC is a multiplexed and secure transport protocol that runs on top
of UDP.  QUIC builds on past transport experience, and implements
mechanisms that make it useful as a modern general-purpose transport
protocol.  Using UDP as the basis of QUIC is intended to address
compatibility issues with legacy clients and middleboxes.  QUIC
authenticates all of its headers, preventing third parties from from
changing them.  QUIC encrypts most of its headers, thereby limiting
protocol evolution to QUIC endpoints only.  Therefore, middleboxes, in
large part, are not required to be updated as new protocol versions
are deployed.  This document describes the core QUIC protocol,
including the conceptual design, wire format, and mechanisms of the
QUIC protocol for connection establishment, stream multiplexing,
stream and connection-level flow control, and data reliability.
Accompanying documents describe QUIC's loss recovery and congestion
control, and the use of TLS 1.3 for key negotiation.

--- middle

# Introduction

QUIC is a multiplexed and secure transport protocol that runs on top
of UDP.  QUIC builds on past transport experience and implements
mechanisms that make it useful as a modern general-purpose transport
protocol.  Using UDP as the substrate, QUIC seeks to be compatible
with legacy clients and middleboxes.  QUIC authenticates all of its
headers, preventing middleboxes and other third parties from changing
them, and encrypts most of its headers, limiting protocol evolution
largely to QUIC endpoints only.

This document describes the core QUIC protocol, including the
conceptual design, wire format, and mechanisms of the QUIC protocol
for connection establishment, stream multiplexing, stream and
connection-level flow control, and data reliability.  Accompanying
documents describe QUIC's loss detection and congestion control
{{!I-D.iyengar-quic-loss-recovery}}, and the use of TLS 1.3 for key
negotiation {{!I-D.thomson-quic-tls}}.

## Notational Conventions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.


# Conventions and Definitions

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


# A QUIC Overview

This section briefly describes QUIC's key mechanisms and benefits.
Key strengths of QUIC include:

  * Low-latency Version Negotiation
  * Low-latency connection establishment
  * Multiplexing without head-of-line blocking
  * Authenticated and encrypted header and payload
  * Rich signaling for congestion control and loss recovery
  * Stream and connection flow control
  * Connection Migration and Resilience to NAT rebinding

## Low-Latency Version Negotiation

QUIC combines version negotiation with the rest of connection
establishment to avoid unnecessary roundtrip delays.  A QUIC client
proposes a version to use for the connection, and encodes the rest of
the handshake using the proposed version.  If the server does not
speak the client-chosen version, it forces version negotiation by
sending back a Version Negotiation packet to the client, causing a
roundtrip of delay before connection establishment.

This mechanism eliminates roundtrip latency when the client's
optimistically-chosen version is spoken by the server, and
incentivizes servers to not lag behind clients in deployment of newer
versions. Additionally, an application may negotiate QUIC versions
out-of-band to increase chances of success in the first roundtrip and
to obviate the additional roundtrip in the case of version mismatch.

## Low-Latency Connection Establishment

QUIC relies on a combined crypto and transport handshake for setting
up a secure transport connection.  QUIC connections are expected to
commonly use 0-RTT handshakes, meaning that for most QUIC connections,
data can be sent immediately following the client handshake packet,
without waiting for a reply from the server.  QUIC provides a
dedicated stream (Stream ID 1) to be used for performing the crypto
handshake and QUIC options negotiation.  The format of the QUIC
options and parameters used during negotiation are described in this
document, but the handshake protocol that runs on Stream ID 1 is
described in the accompanying crypto handshake draft {{!I-D.thomson-
quic-tls}}.

## Stream Multiplexing

When application messages are transported over TCP, independent
application messages can suffer from head-of-line blocking.  When an
application multiplexes many streams atop TCP's single-bytestream
abstraction, a loss of a TCP segment results in blocking of all
subsequent segments until a retransmission arrives, irrespective of
the application streams that are encapsulated in subsequent segments.
QUIC ensures that lost packets carrying data for an individual stream
only impact that specific stream.  Data received on other streams can
continue to be reassembled and delivered to the application.

## Rich Signaling for Congestion Control and Loss Recovery

QUIC's packet framing and acknowledgments carry rich information that
help both congestion control and loss recovery in fundamental ways.
Each QUIC packet carries a new packet number, including those carrying
retransmitted data.  This obviates the need for a separate mechanism
to distinguish acks for retransmissions from those for original
transmissions, avoiding TCP's retransmission ambiguity problem.  QUIC
acknowledgments also explicitly encode the delay between the receipt
of a packet and its acknowledgment being sent, and together with the
monotonically-increasing packet numbers, this allows for precise
network roundtrip-time (RTT) calculation.  QUIC's ACK frames support
up to 256 ack blocks, so QUIC is more resilient to reordering than TCP
with SACK support, as well as able to keep more bytes on the wire when
there is reordering or loss.

## Stream and Connection Flow Control

QUIC implements stream- and connection-level flow control, closely
following HTTP/2's flow control mechanisms.  At a high level, a QUIC
receiver advertises the absolute byte offset within each stream up to
which the receiver is willing to receive data.  As data is sent,
received, and delivered on a particular stream, the receiver sends
WINDOW_UPDATE frames that increase the advertised offset limit for
that stream, allowing the peer to send more data on that stream.  In
addition to this stream-level flow control, QUIC implements
connection-level flow control to limit the aggregate buffer that a
QUIC receiver is willing to allocate to all streams on a connection.
Connection-level flow control works in the same way as stream-level
flow control, but the bytes delivered and highest received offset are
all aggregates across all streams.

## Authenticated and Encrypted Header and Payload

TCP headers appear in plaintext on the wire and are not authenticated,
causing a plethora of injection and header manipulation issues for
TCP, such as receive-window manipulation and sequence-number
overwriting.  While some of these are mechanisms used by middleboxes
to improve TCP performance, others are active attacks.  Even
"performance-enhancing" middleboxes that routinely interpose on the
transport state machine end up limiting the evolvability of the
transport protocol, as has been observed in the design of MPTCP and in
its subsequent deployability issues.

Generally, QUIC packets are always authenticated and the payload is
typically fully encrypted.  The parts of the packet header which are
not encrypted are still authenticated by the receiver, so as to thwart
any packet injection or manipulation by third parties.  Some early
handshake packets, such as the Version Negotiation packet, are not
encrypted, but information sent in these unencrypted handshake packets
is later verified under crypto cover.

PUBLIC_RESET packets that reset a connection are currently not
authenticated.

## Connection Migration and Resilience to NAT Rebinding

QUIC connections are identified by a 64-bit Connection ID, randomly
generated by the client.  QUIC's consistent connection ID allows
connections to survive changes to the client's IP and port, such as
those caused by NAT rebindings or by the client changing network
connectivity to a new address.  QUIC provides automatic cryptographic
verification of a rebound client, since the client continues to use
the same session key for encrypting and decrypting packets.  The
consistent connection ID can be used to allow migration of the
connection to a new server IP address as well, since the Connection ID
remains consistent across changes in the client's and the server's
network addresses.


# Packet Types and Formats

We first describe QUIC's packet types and their formats, since some are
referenced in subsequent mechanisms.  Note that unless otherwise
noted, all values specified in this document are in little-endian
format and all field sizes are in bits.

## Common Header

All QUIC packets begin with a QUIC Common header, as shown below.

~~~
   +------------+---------------------------------+
   |  Flags(8)  |  Connection ID (64) (optional)  |
   +------------+---------------------------------+
~~~

The fields in the Common Header are the following:

* Flags:
   * 0x01 = VERSION.  The semantics of this flag depends on whether
     the packet is sent by the server or the client.  A client MAY set
     this flag and include exactly one proposed version.  A server may
     set this flag when the client-proposed version was unsupported,
     and may then provide a list (0 or more) of acceptable versions as
     a part of version negotiation (described in Section XXX.)

   * 0x02 = PUBLIC_RESET.  Set to indicate that the packet is a
     Public Reset packet.

   * 0x04 = DIVERSIFICATION_NONCE.  Set to indicate the presence of a
     32-byte diversification nonce in the header.
     (DISCUSS_AND_MODIFY: This flag should be removed along with the
     Diversification Nonce bits, as discussed further below.)

   * 0x08 = CONNECTION_ID.  Indicates the Connection ID is present in
     the packet.  This must be set in all packets until negotiated to
     a different value for a given direction.  For instance, if a
     client indicates that the 5-tuple fully identifies the connection
     at the client, the connection ID is optional in the
     server-to-client direction.

   * 0x30 = PACKET_NUMBER_SIZE.  These two bits indicate the number of
     low-order-bytes of the packet number that are present in each
     packet.
     + 11 indicates that 6 bytes of the packet number are present
     + 10 indicates that 4 bytes of the packet number are present
     + 01 indicates that 2 bytes of the packet number are present
     + 00 indicates that 1 byte of the packet number is present

   * 0x40 = MULTIPATH.  This bit is reserved for multipath use.
   * 0x80 is currently unused, and must be set to 0.

* Connection ID: An unsigned 64-bit random number chosen by the
  client, used as the identifier of the connection.  Connection ID is
  tied to a QUIC connection, and remains consistent across client
  and/or server IP and port changes.

While all QUIC packets have the same common header, there are three
types of packets: Regular packets, Version Negotiation packets, and
Public Reset packets.  The flowchart below shows how a packet is
classified into one of these three packet types:

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
           | VERSION    |  YES    | Packet sent |  YES
           | flag set?  |-------->| by server?  |--------> Version Negotiation
           +------------+         +-------------+               packet
                 |                       |
                 | NO                    | NO
                 V                       V
         Regular packet with       Regular packet with
     no QUIC Version in header    QUIC Version in header
~~~
{: #packet-types title="Types of QUIC Packets"}

## Regular Packets

Each Regular packet's header consists of a Common Header followed by
fields specific to Regular packets, as shown below:

~~~
+------------+---------------------------------+
|  Flags(8)  |  Connection ID (64) (optional)  | ->
+------------+---------------------------------+
+---------------------------------------+-------------------------------+
|  Version (32) (client-only, optional) |  Diversification Nonce (256)  | ->
+---------------------------------------+-------------------------------+
+------------------------------------+
|  Packet Number (8, 16, 32, or 48)  | ->
+------------------------------------+
+------------+
|  AEAD Data |
+------------+

Decrypted AEAD Data:
+------------+-----------+     +-----------+
|   Frame 1  |  Frame 2  | ... |  Frame N  |
+------------+-----------+     +-----------+
~~~
{: #regular-packet-format title="Regular Packet"}

The fields in a Regular packet past the Common Header are the
following:

* QUIC Version: A 32-bit opaque tag that represents the version of the
  QUIC protocol.  Only present in the client-to-server direction, and
  if the VERSION flag is set.  Version Negotiation is described in
  Section XXX.

* DISCUSS_AND_REPLACE: Diversification Nonce: A 32-byte nonce
  generated by the server and used only in the Server->Client
  direction to ensure that the server is able to generate unique keys
  per connection.  Specifically, when using QUIC's 0-RTT crypto
  handshake, a repeated CHLO with the exact same connection ID and
  CHLO can lead to the same (intermediate) initial-encryption keys
  being derived for the connection.  A server-generated nonce
  disallows a client from causing the same keys to be derived for two
  distinct connections.  Once the connection is forward-secure, this
  nonce is no longer present in packets.  This nonce can be removed
  from the packet header if a requirement can be added for the crypto
  handshake to ensure key uniqueness.  The expectation is that TLS1.3
  meets this requirement.  Upon working group adoption of this
  document, this requirement should be added to the crypto handshake
  requirements, and the nonce should be removed from the packet
  format.

* Packet Number: The lower 8, 16, 32, or 48 bits of the packet number,
  based on the PACKET_NUMBER_SIZE flag.  Each Regular packet is
  assigned a packet number by the sender.  The first packet sent by an
  endpoint MUST have a packet number of 1.

* AEAD Data: A Regular packet's header, which includes the Common
  Header, and the Version, Diversification Nonce, and Packet Number
  fields, is authenticated but not encrypted.  The rest of a Regular
  packet, starting with the first frame, is both authenticated and
  encrypted.  Immediately following the header, Regular packets
  contain AEAD (Authenticated Encryption with Associated Data) data.
  This data must be decrypted in order for the contents to be
  interpreted.  After decryption, the plaintext consists of a sequence
  of frames, as shown (frames are described in Section XXX).

### Packet Number Compression and Reconstruction

The complete packet number is a 64-bit unsigned number and is used as
part of a cryptographic nonce for packet encryption.  To reduce the
number of bits required to represent the packet number over the wire,
at most 48 bits of the packet number are transmitted over the wire.  A
QUIC endpoint MUST NOT reuse a complete packet number within the same
connection (that is, under the same cryptographic keys).  If the total
number of packets transmitted in this connection reaches 2^64 - 1, the
sender MUST close the connection by sending a CONNECTION_CLOSE frame
with the error code QUIC_SEQUENCE_NUMBER_LIMIT_REACHED (connection
termination is described in Section XXX.)  For unambiguous
reconstruction of the complete packet number by a receiver from the
lower-order bits, a QUIC sender MUST NOT have more than
2^(packet_number_size - 2) in flight at any point in the connection.
In other words,

* If a sender sets PACKET_NUMBER_SIZE bits to 11, it MUST NOT have
  more than (2^46) packets in flight.
* If a sender sets PACKET_NUMBER_SIZE bits to 10, it MUST NOT have
  more than (2^30) packets in flight.
* If a sender sets PACKET_NUMBER_SIZE bits to 01, it MUST NOT have
  more than (2^14) packets in flight.
* If a sender sets PACKET_NUMBER_SIZE bits to 00, it MUST NOT have
  more than (2^6) packets in flight.

  DISCUSS: Should the receiver be required to enforce this rule that
  the sender MUST NOT exceed the inflight limit?  Specifically, should
  the receiver drop packets that are received outside this window?

  Any truncated packet number received from a peer MUST be
  reconstructed as the value closest to the next expected packet number
  from that peer.

(TODO: Clarify how packet number size can change mid-connection.)

### Frames and Frame Types

A Regular packet MUST contain at least one frame, and MAY contain
multiple frames and multiple frame types.  Frames MUST fit within a
single QUIC packet and MUST NOT span a QUIC packet boundary.  Each
frame begins with a Frame Type byte, indicating its type, followed by
type-dependent headers, and variable-length data, as follows:

~~~
   +-----------+---------------------------+-------------------------+
   |  Type (8) |  Headers (type-dependent) |  Data (type-dependent)  |
   +-----------+---------------------------+-------------------------+
~~~

The following table lists currently defined frame types.  Note that
the Frame Type byte in STREAM and ACK frames is used to carry other
frame-specific flags.  For all other frames, the Frame Type byte
simply identifies the frame.  These frames are explained in more
detail as they are referenced later in the document.

~~~
      +------------------+--------------------+
      | Type-field value |     Frame type     |
      +------------------+--------------------+
      | 1FDOOOSS         |  STREAM            |
      | 01NTLLMM         |  ACK               |
      | 00000000 (0x00)  |  PADDING           |
      | 00000001 (0x01)  |  RST_STREAM        |
      | 00000010 (0x02)  |  CONNECTION_CLOSE  |
      | 00000011 (0x03)  |  GOAWAY            |
      | 00000100 (0x04)  |  WINDOW_UPDATE     |
      | 00000101 (0x05)  |  BLOCKED           |
      | 00000110 (0x06)  |  STOP_WAITING      |
      | 00000111 (0x07)  |  PING              |
      +------------------+--------------------+
~~~
{: #frame-types title="Types of QUIC Frames"}

## Version Negotiation Packet

A Version Negotiation packet is only sent by the server, MUST have the
VERSION flag set, and MUST include the full 64-bit Connection ID.  The
rest of the Version Negotiation packet is a list of 4-byte versions
which the server supports, as shown below.

~~~
+-----------------------------------+
|  Flags(8)  |  Connection ID (64)  | ->
+-----------------------------------+
+------------------------------+----------------------------------------+
|  1st Supported Version (32)  |  2nd Supported Version (32) supported  | ...
+------------------------------+----------------------------------------+
~~~
{: #version-negotiation-format title="Version Negotiation Packet"}

## Public Reset Packet

A Public Reset packet MUST have the PUBLIC_RESET flag set, and MUST
include the full 64-bit connection ID.  The rest of the Public Reset
packet is encoded as if it were a crypto handshake message of the tag
PRST, as shown below.

~~~
   +-----------------------------------+
   |  Flags(8)  |  Connection ID (64)  | ->
   +-----------------------------------+
   +-------------------------------------+
   |  Quic Tag (PRST) and tag value map  |
   +-------------------------------------+
~~~
{: #public-reset-format title="Public Reset Packet"}

The tag value map contains the following tag-values:

* RNON (public reset nonce proof) - a 64-bit unsigned integer.
* RSEQ (rejected packet number) - a 64-bit packet number.
* CADR (client address) - the observed client IP address and port
  number.  This is currently for debugging purposes only and hence
  is optional.

DISCUSS_AND_REPLACE: The crypto handshake message format is described
in the QUIC crypto document, and should be replaced with something
simpler when this document is adopted.  The purpose of the tag-value
map following the PRST tag is to enable the receiver of the Public
Reset packet to reasonably authenticate the packet.  This map is an
extensible map format that allows specification of various tags, which
should again be replaced by something simpler.


# Security Considerations

# IANA Considerations

This document has no IANA actions yet.


--- back

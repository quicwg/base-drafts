---
title: "QUIC: A UDP-Based Secure Transport"
abbrev: QUIC Core Protocol
docname: draft-ietf-quic-core-latest
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
    seriesinfo:
      Internet-Draft: draft-ietf-quic-recovery-latest
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
    seriesinfo:
      Internet-Draft: draft-ietf-quic-tls-latest
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

  EARLY-DESIGN:
    title: "QUIC: Multiplexed Transport Over UDP"
    author:
      - ins: J. Roskind
    date: 2013-12-02
    target: "https://goo.gl/dMVtFi"

  SLOWLORIS:
    title: "Welcome to Slowloris..."
    author:
      - ins: R. RSnake Hansen
    date: 2009-06
    target:
     "https://web.archive.org/web/20150315054838/http://ha.ckers.org/slowloris/"


--- abstract

This document defines the core of the QUIC transport protocol.  This document
describes connection establishment and packet format. Accompanying documents
describe multiplexing, reliability, the cryptographic handshake and loss
detection.


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
wire format, and mechanisms of the QUIC protocol across individual QUIC
versions.  Each version will define appropriate mechanisms for stream
multiplexing, stream and connection-level flow control, and data reliability.


# Conventions and Definitions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.

Definitions of terms that are used in this document:

Client:

: The endpoint initiating a QUIC connection.

Server:

: The endpoint accepting incoming QUIC connections.

Endpoint:

: The client or server end of a connection.

Connection:

: A conversation between two QUIC endpoints.

Connection ID:

: The identifier for a QUIC connection.

QUIC packet:

: A well-formed UDP payload that can be parsed by a QUIC receiver.  QUIC packet
  size in this document refers to the UDP payload size.


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

* Authenticated packet headers

* Version negotiation


## Low-Latency Connection Establishment

QUIC supports sending version-specific data immediately.  QUIC versions are
expected to use a combined cryptographic and transport handshake for setting up
a secure transport connection.  These handshakes will commonly be 0-RTT
handshakes, meaning that for most QUIC connections, data can be sent immediately
following the client handshake packet, without waiting for a reply from the
server.

## Authenticated and Encrypted Header and Payload

TCP headers appear in plaintext on the wire and are not authenticated, causing a
plethora of injection and header manipulation issues for TCP, such as
receive-window manipulation and sequence-number overwriting.  While some of
these are mechanisms used by middleboxes to improve TCP performance, others are
active attacks.  Even "performance-enhancing" middleboxes that routinely
interpose on the transport state machine end up limiting the evolvability of the
transport protocol, as has been observed in the design of MPTCP {{?RFC6824}} and
in its subsequent deployability issues.

QUIC packets are always authenticated and the payload is typically fully
encrypted.  The parts of the packet header which are not encrypted are still
authenticated by the receiver, so as to thwart any packet injection or
manipulation by third parties.  Some early handshake packets, such as the
Version Negotiation packet, are not encrypted, but information sent in these
unencrypted handshake packets will later be verified as part of cryptographic
processing.

PUBLIC_RESET packets that reset a connection are currently not authenticated.

## Version Negotiation {#benefit-version-negotiation}

QUIC version negotiation allows for multiple versions of the protocol to be
deployed and used concurrently. Version negotiation is described in
{{version-negotiation}}.


# Versions {#versions}

QUIC versions are identified using a 32-bit value.

The version 0x00000000 is reserved to represent an invalid version. Versions
with the most significant 16 bits of the version number cleared are reserved for
use in future IETF consensus documents.

Versions that follow the pattern 0x?a?a?a?a are reserved for use in forcing
version negotiation to be exercised.  That is, any version number where the low
four bits of all octets is 1010 (in binary).  A client or server MAY advertise
support for any of these reserved versions.

Reserved version numbers will probably never represent a real protocol; a client
MAY use one of these version numbers with the expectation that the server will
initiate version negotiation; a server MAY advertise support for one of these
versions and can expect that clients ignore the value.


# Packet Types and Formats

We first describe QUIC's packet types and their formats, since some are
referenced in subsequent mechanisms.

All numeric values are encoded in network byte order (that is, big-endian) and
all field sizes are in bits.  When discussing individual bits of fields, the
least significant bit is referred to as bit 0.  Hexadecimal notation is used for
describing the value of fields.

Any QUIC packet has either a long or a short header, as indicated by the Header
Form bit. Long headers are expected to be used early in the connection before
version negotiation and establishment of 1-RTT keys, and for public resets.
Short headers are minimal version-specific headers, which can be used after
version negotiation and 1-RTT keys are established.

## Long Header

~~~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|1|   Type (7)  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                       Connection ID (64)                      +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Packet Number (32)                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Version (32)                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Payload (*)                        ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~
{: #fig-long-header title="Long Header Format"}

Long headers are used for packets that are sent prior to the completion of
version negotiation and establishment of 1-RTT keys. Once both conditions are
met, a sender SHOULD switch to sending short-form headers. While inefficient,
long headers MAY be used for packets encrypted with 1-RTT keys. The long form
allows for special packets, such as the Version Negotiation and the Public Reset
packets to be represented in this uniform fixed-length packet format. A long
header contains the following fields:

Header Form:

: The most significant bit (0x80) of the first octet is set to 1 for long
  headers and 0 for short headers.

Long Packet Type:

: The remaining seven bits of first octet of a long packet is the packet type.
  This field can indicate one of 128 packet types.  Some types are specified in
  {{long-packet-types}}; individual versions of QUIC will define additional
  types.

Connection ID:

: Octets 1 through 8 contain the connection ID. {{connection-id}} describes the
  use of this field in more detail.

Packet Number:

: Octets 9 to 12 contain the packet number.  {{packet-numbers}} describes the
  use of packet numbers.

Version:

: Octets 13 to 16 contain the selected protocol version.  This field indicates
  which version of QUIC is in use and determines how the rest of the protocol
  fields are interpreted.

Payload:

: Octets from 17 onwards (the rest of QUIC packet) are the payload of the
  packet.

The following packet types are defined:

| Type | Name                          | Section                     |
|:-----|:------------------------------|:----------------------------|
| 01   | Version Negotiation           | {{packet-version}}          |
| 02   | Public Reset                  | {{packet-public-reset}}     |
{: #long-packet-types title="Long Header Packet Types"}

Packet types 3 and greater are version-specific.  For these packet types, the
interpretation of the fields and the payload are specific to a version and
packet type.  Type-specific semantics for cross-version packets are described in
the following sections.


## Short Header

~~~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|0|C|K| Type (5)|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                     [Connection ID (64)]                      +
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Payload (*)                        ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~
{: #fig-short-header title="Short Header Format"}

The short header can be used after the version and 1-RTT keys are negotiated.
This header form has the following fields:

Header Form:

: The most significant bit (0x80) of the first octet of a packet is the header
  form.  This bit is set to 0 for the short header.

Connection ID Flag:

: The second bit (0x40) of the first octet indicates whether the Connection ID
  field is present.  If set to 1, then the Connection ID field is present; if
  set to 0, the Connection ID field is omitted.

Key Phase Bit:

: The third bit (0x20) of the first octet indicates the key phase, which allows
  a recipient of a packet to identify the packet protection keys that are used
  to protect the packet.  See {{QUIC-TLS}} for details.

Short Packet Type:

: The remaining 5 bits of the first octet include one of 32 packet types.
  All short packet types are version-dependent.

Connection ID:

: If the Connection ID Flag is set, a connection ID occupies octets 1 through 8
  of the packet.  See {{connection-id}} for more details.

Payload:

: Packets with a short header include a version-defined payload.


## Version Negotiation Packet {#packet-version}

A Version Negotiation packet has long headers with a type value of 0x01 and is
sent only by servers.  The Version Negotiation packet is a response to a client
packet that contains a version that is not supported by the server.

The packet number, connection ID and version fields echo corresponding values
from the triggering client packet.  This allows clients some assurance that the
server received the packet and that the Version Negotiation packet was not
carried in a packet with a spoofed source address.

The payload of the Version Negotiation packet is a list of 32-bit versions which
the server supports, as shown below.

~~~
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Supported Version 1 (32)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   [Supported Version 2 (32)]                ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
                               ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   [Supported Version N (32)]                ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~
{: #version-negotiation-format title="Version Negotiation Packet"}

See {{version-negotiation}} for a description of the version negotiation
process.


## Public Reset Packet {#packet-public-reset}

A Public Reset packet is only sent by servers and is used to abruptly terminate
communications. Public Reset is provided as an option of last resort for a
server that does not have access to the state of a connection, including the
version number.  This is intended for use by a server that has lost state (for
example, through a crash or outage). A server that wishes to communicate a fatal
connection error MUST use a version-specific frame if it has sufficient state to
do so.

A Public Reset packet uses long headers with a type value of 0x02.

The connection ID and packet number of fields together contain octets 1 through
12 from the packet that triggered the reset.  For a client that sends a
connection ID on every packet, the Connection ID field is simply an echo of the
client's Connection ID.  The Packet Number field will contain either the
client's Packet Number or four octets from the beginning of the client packet's
payload, depending on the client's packet type.

The version field contains the QUIC version used on the connection if known, and
otherwise the server's preferred QUIC version.

A Public Reset packet sent by a server indicates that it does not have the
state necessary to continue with a connection.  In this case, the server will
include the fields that prove that it originally participated in the connection
(see {{public-reset-proof}} for details).

Upon receipt of a Public Reset packet that contains a valid proof, a client MUST
tear down state associated with the connection.  The client MUST then cease
sending packets on the connection and SHOULD discard any subsequent packets that
arrive. A Public Reset that does not contain a valid proof MUST be ignored.

### Public Reset Proof

TODO: Details to be added.


## Connection ID {#connection-id}

QUIC connections are identified by their 64-bit Connection ID.  All long headers
contain a Connection ID.  Short headers indicate the presence of a Connection ID
using the CONNECTION_ID flag.  When present, the Connection ID is in the same
location in all packet headers, making it straightforward for middleboxes, such
as load balancers, to locate and use it.

QUIC Connection IDs can change during the lifetime of a connection by mutual
agreement between the endpoints; mechanisms for changing Connection IDs are
version-specific.

## Packet Numbers {#packet-numbers}

The use of the Packet Number field varies by packet type.  The use of this field
in Version Negotiation ({{packet-version}}) and Public Reset
({{packet-public-reset}}) packets is described in this document.

# Handling Packets from Different Versions {#version-specific}

Elements in this document are version-independent.  All other fields and packet
types MUST be ignored when processing a packet that contains an unsupported
version.

## Version Negotiation {#version-negotiation}

QUIC's connection establishment begins with version negotiation, since all
communication between the endpoints, including packet and payload formats,
relies on the two endpoints agreeing on a version.

A QUIC connection begins with a client sending an initial packet. The details
of the handshake mechanisms are described in each version, but all of the
initial packets sent from the client to the server MUST use the long header
format and MUST specify the version of the protocol being used.

When the server receives a packet from a client with the long header format, it
compares the client's version to the versions it supports.

If the version selected by the client is not acceptable to the server, the
server discards the incoming packet and responds with a Version Negotiation
packet ({{packet-version}}).  This includes a list of versions that the server
will accept.

A server sends a Version Negotiation packet for every packet that it receives
with an unacceptable version.  This allows a server to process packets with
unsupported versions without retaining state.  Though either the initial client
packet or the version negotiation packet that is sent in response could be lost,
the client will send new packets until it successfully receives a response.

If the packet contains a version that is acceptable to the server, the server
responds with packets defined by the version.  This commits the server to the
version that the client selected.

When the client receives a Version Negotiation packet from the server, it should
select an acceptable protocol version.  If the server lists an acceptable
version, the client selects that version and reattempts to create a connection
using that version.  Though the contents of a packet might not change in
response to version negotiation, a client MUST increase the packet number it
uses on every packet it sends.  Packets MUST continue to use long headers and
MUST include the new negotiated protocol version.

The client MUST use the long header format and include its selected version on
all packets until it has received a packet from the server which is not a
Version Negotiation packet and has satisfied any other conditions defined by the
selected version.

A client MUST NOT change the version it uses unless it is in response to a
Version Negotiation packet from the server.  Once a client receives a packet
from the server which is not a Version Negotiation packet, it MUST ignore other
Version Negotiation packets on the same connection.  Similarly, a client MUST
ignore a Version Negotiation packet if it has already received and acted on a
Version Negotiation packet.

A client MUST ignore a Version Negotiation packet that lists the client's chosen
version.

Version negotiation uses unprotected data. Each version of QUIC MUST define a
mechanism to revalidate the result of the negotiation.

## Using Reserved Versions

For a server to use a new version in the future, clients must correctly handle
unsupported versions. To help ensure this, a server SHOULD include a reserved
version (see {{versions}}) while generating a Version Negotiation packet.

The design of version negotiation permits a server to avoid maintaining state
for packets that it rejects in this fashion.  However, when the server generates
a Version Negotiation packet, it cannot randomly generate a reserved version
number. This is because the client will validate the list of versions in the
version-specific handshake.  To avoid the selected version number changing
during connection establishment, the reserved version SHOULD be generated as a
function of values that will be available to the server when later generating
its handshake packets.

A pseudorandom function that takes client address information (IP and port) and
the client selected version as input would ensure that there is sufficient
variability in the values that a server uses.

A client MAY send a packet using a reserved version number.  This can be used to
solicit a list of supported versions from a server.

# Packetization and Reliability

The Path Maximum Transmission Unit (PMTU) is the maximum size of the entire IP
header, UDP header, and UDP payload. The UDP payload includes the QUIC public
header, protected payload, and any authentication fields.

All QUIC packets SHOULD be sized to fit within the estimated PMTU to avoid IP
fragmentation or packet drops. To optimize bandwidth efficiency, endpoints
SHOULD use Packetization Layer PMTU Discovery ({{!RFC4821}}) and MAY use PMTU
Discovery ({{!RFC1191}}, {{!RFC1981}}) for detecting the PMTU, setting the PMTU
appropriately, and storing the result of previous PMTU determinations.

In the absence of these mechanisms, QUIC endpoints SHOULD NOT send IP packets
larger than 1280 octets. Assuming the minimum IP header size, this results in
a QUIC packet size of 1232 octets for IPv6 and 1252 octets for IPv4.

QUIC endpoints that implement any kind of PMTU discovery SHOULD maintain an
estimate for each combination of local and remote IP addresses (as each pairing
could have a different maximum MTU in the path).

Specific versions of QUIC MAY define additional restrictions or mechanisms for
controlling packet size.

## Requirements on Version Definitions

Each version of QUIC MUST define mechanisms for:

 - Key agreement
 - Setting negotiation
 - Revalidation of version negotiation
 - Client address validation

If the version defines any short-form packets, the version MAY also specify
additional restrictions on when such packet types can be used.

# Security and Privacy Considerations

TBD.

# IANA Considerations

This document requests no actions of IANA.

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

> **RFC Editor's Note:** Please remove this section prior to publication of a
> final version of this document.

Issue and pull request numbers are listed with a leading octothorp.

## Since draft-ietf-quic-transport-03

 - Split from the transport document

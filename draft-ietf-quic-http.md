---
title: Hypertext Transfer Protocol (HTTP) over QUIC
abbrev: HTTP over QUIC
docname: draft-ietf-quic-http-latest
date: {DATE}
category: std
ipr: trust200902
area: Transport
workgroup: QUIC

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
 -
    ins: M. Bishop
    name: Mike Bishop
    org: Microsoft
    email: Michael.Bishop@microsoft.com
    role: editor

normative:

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

  QUIC-TRANSPORT:
    title: "QUIC: A UDP-Based Multiplexed and Secure Transport"
    date: {DATE}
    author:
      -
        ins: J. Iyengar
        name: Jana Iyengar
        org: Google
        role: editor
      -
        ins: M. Thomson
        name: Martin Thomson
        org: Mozilla
        role: editor

informative:


--- abstract

The QUIC transport protocol has several features that are desirable in a
transport for HTTP, such as stream multiplexing, per-stream flow control, and
low-latency connection establishment.  This document describes a mapping of
HTTP semantics over QUIC.  Specifically, this document identifies HTTP/2
features that are subsumed by QUIC, and describes how the other features can be
implemented atop QUIC.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/http>.


--- middle


# Introduction

The QUIC transport protocol has several features that are desirable in a
transport for HTTP, such as stream multiplexing, per-stream flow control, and
low-latency connection establishment. This document describes a mapping of HTTP
semantics over QUIC, drawing heavily on the existing TCP mapping, HTTP/2.
Specifically, this document identifies HTTP/2 features that are subsumed by
QUIC, and describes how the other features can be implemented atop QUIC.

QUIC is described in {{QUIC-TRANSPORT}}.  For a full description of HTTP/2, see
{{!RFC7540}}.


## Notational Conventions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.


# QUIC Advertisement

A server advertises that it can speak HTTP/QUIC via the Alt-Svc ({{!RFC7838}})
HTTP response header (or the semantically equivalent Alt-Svc HTTP/2 Extension
Frame Type), using the ALPN token defined in {{connection-establishment}}.

Thus, a server could indicate in an HTTP/1.1 or HTTP/2 response that HTTP/QUIC
was available on UDP port 443 by including the following header in any
response:

    Alt-Svc: hq=":443"

## QUIC Version Hints {#alt-svc-version-hint}

This document defines the "v" parameter for Alt-Svc, which is used to provide
version-negotiation hints to HTTP/QUIC clients. Syntax:

    v = version
    version = DQUOTE ( "c" version-string / "x" version-number ) DQUOTE
    version-string = 4tchar; token-safe QUIC version
    version-number = 1*8HEXDIG; hex-encoded QUIC version

When multiple versions are supported, the "v" parameter MAY be repeated multiple
times in a single Alt-Svc entry.  For example, if a server supported both
version "Q034" and version 0x00000001, it would specify the following header:

    Alt-Svc: hq=":443";v="x1";v="cQ034"

Where multiple versions are listed, the order of the values reflects the
server's preference (with the first value being the most preferred version).

QUIC versions are four-octet sequences with no additional constraints on format.
Versions containing octets not allowed in tokens (tchar, {{!RFC7230}}, Section
3.2.6) MUST be encoded using the hexadecimal representation.  Versions
containing only octets allowed in tokens MAY be encoded using either
representation.

On receipt of an Alt-Svc header indicating QUIC support, a client MAY attempt to
establish a QUIC connection on the indicated port and, if successful, send HTTP
requests using the mapping described in this document. Servers SHOULD list only
versions which they support, but MAY omit supported versions for any reason.

Connectivity problems (e.g. firewall blocking UDP) may result in QUIC connection
establishment failure, in which case the client should gracefully fall back to
HTTP/2.

# Connection Establishment {#connection-establishment}

HTTP/QUIC connections are established as described in {{QUIC-TRANSPORT}}. During
connection establishment, HTTP/QUIC support is indicated by selecting the ALPN
token "hq" in the crypto handshake.

While connection-level options pertaining to the core QUIC protocol are set in
the initial crypto handshake, HTTP-specific settings are conveyed
in the SETTINGS frame. After the QUIC connection is established, a SETTINGS
frame ({{frame-settings}}) MUST be sent as the initial frame of the HTTP control
stream (StreamID 3, see {{stream-mapping}}).

## Draft Version Identification

> **RFC Editor's Note:**  Please remove this section prior to publication of a
> final version of this document.

Only implementations of the final, published RFC can identify themselves as
"hq". Until such an RFC exists, implementations MUST NOT identify themselves
using these strings.

Implementations of draft versions of the protocol MUST add the string "-" and
the corresponding draft number to the identifier. For example,
draft-ietf-quic-http-01 is identified using the string "hq-01".

Non-compatible experiments that are based on these draft versions MUST append
the string "-" and an experiment name to the identifier. For example, an
experimental implementation based on draft-ietf-quic-http-09 which reserves an
extra stream for unsolicited transmission of 1980s pop music might identify
itself as "hq-09-rickroll". Note that any label MUST conform to the "token"
syntax defined in Section 3.2.6 of [RFC7230]. Experimenters are encouraged to
coordinate their experiments on the quic@ietf.org mailing list.


# Stream Mapping and Usage {#stream-mapping}

A QUIC stream provides reliable in-order delivery of bytes, but makes no
guarantees about order of delivery with regard to bytes on other streams. On the
wire, data is framed into QUIC STREAM frames, but this framing is invisible to
the HTTP framing layer. A QUIC receiver buffers and orders received STREAM
frames, exposing the data contained within as a reliable byte stream to the
application.

QUIC reserves Stream 1 for crypto operations (the handshake, crypto config
updates). Stream 3 is reserved for sending and receiving HTTP control frames,
and is analogous to HTTP/2's Stream 0.

When HTTP headers and data are sent over QUIC, the QUIC layer handles most of
the stream management. An HTTP request/response consumes a pair of streams: This
means that the client's first request occurs on QUIC streams 5 and 7, the second
on stream 9 and 11, and so on. The server's first push consumes streams 2 and 4.
This amounts to the second least-significant bit differentiating the two streams
in a request.

The lower-numbered stream is called the message control stream and carries
frames related to the request/response, including HEADERS. All request control
streams are exempt from connection-level flow control. The higher-numbered
stream is the data stream and carries the request/response body with no
additional framing. Note that a request or response without a body will cause
this stream to be half-closed in the corresponding direction without
transferring data.

Pairs of streams must be utilized sequentially, with no gaps.  The data stream
MUST be reserved with the QUIC implementation when the message control stream
is opened or reserved, and MUST be closed after transferring the body, or else
closed immediately after sending the request headers if there is no body.

HTTP does not need to do any separate multiplexing when using QUIC - data sent
over a QUIC stream always maps to a particular HTTP transaction. Requests and
responses are considered complete when the corresponding QUIC streams are closed
in the appropriate direction.


##  Stream 3: Connection Control Stream

Since most connection-level concerns from HTTP/2 will be managed by QUIC, the
primary use of Stream 3 will be for SETTINGS and PRIORITY frames. Stream 3 is
exempt from connection-level flow-control.

## HTTP Message Exchanges

A client sends an HTTP request on a new pair of QUIC streams. A server sends an
HTTP response on the same streams as the request.

An HTTP message (request or response) consists of:

1. one header block (see {{frame-headers}}) on the control stream containing the
   message headers (see {{!RFC7230}}, Section 3.2),

2. the payload body (see {{!RFC7230}}, Section 3.3), sent on the data stream,

3. optionally, one header block on the control stream containing the
   trailer-part, if present (see {{!RFC7230}}, Section 4.1.2).

In addition, prior to sending the message header block indicated above, a
response may contain zero or more header blocks on the control stream containing
the message headers of informational (1xx) HTTP responses (see {{!RFC7230}},
Section 3.2 and {{!RFC7231}}, Section 6.2).

The data stream MUST be half-closed immediately after the transfer of the body.
If the message does not contain a body, the corresponding data stream MUST still
be half-closed without transferring any data. The "chunked" transfer encoding
defined in Section 4.1 of {{!RFC7230}} MUST NOT be used.

Trailing header fields are carried in an additional header block on the message
control stream. Such a header block is a sequence of HEADERS frames with End
Header Block set on the last frame. Senders MUST send only one header block in
the trailers section; receivers MUST decode any subsequent header blocks in
order to maintain HPACK decoder state, but the resulting output MUST be
discarded.

An HTTP request/response exchange fully consumes a pair of streams. After
sending a request, a client closes the streams for sending; after sending a
response, the server closes its streams for sending and the QUIC streams are
fully closed.

A server can send a complete response prior to the client sending an entire
request if the response does not depend on any portion of the request that has
not been sent and received. When this is true, a server MAY request that the
client abort transmission of a request without error by sending a RST_STREAM
with an error code of NO_ERROR after sending a complete response and closing its
stream. Clients MUST NOT discard responses as a result of receiving such a
RST_STREAM, though clients can always discard responses at their discretion for
other reasons.

### Header Compression

HTTP/QUIC uses HPACK header compression as described in {{!RFC7541}}. HPACK was
designed for HTTP/2 with the assumption of in- order delivery such as that
provided by TCP. A sequence of encoded header blocks must arrive (and be
decoded) at an endpoint in the same order in which they were encoded. This
ensures that the dynamic state at the two endpoints remains in sync.

QUIC streams provide in-order delivery of data sent on those streams, but there
are no guarantees about order of delivery between streams. To achieve in-order
delivery of HEADERS frames in QUIC, the HPACK-bearing frames contain a counter
which can be used to ensure in-order processing. Data (request/response bodies)
which arrive out of order are buffered until the corresponding HEADERS arrive.

This does introduce head-of-line blocking: if the packet containing HEADERS for
stream N is lost or reordered then the HEADERS for stream N+4 cannot be
processed until it has been retransmitted successfully, even though the HEADERS
for stream N+4 may have arrived.

DISCUSS:
: Keep HPACK with HOLB? Redesign HPACK to be order-invariant? How much
do we need to retain compatibility with HTTP/2's HPACK?


### The CONNECT Method

The pseudo-method CONNECT ({{!RFC7231}}, Section 4.3.6) is primarily used with
HTTP proxies to establish a TLS session with an origin server for the purposes
of interacting with "https" resources. In HTTP/1.x, CONNECT is used to convert
an entire HTTP connection into a tunnel to a remote host. In HTTP/2, the CONNECT
method is used to establish a tunnel over a single HTTP/2 stream to a remote
host for similar purposes.

A CONNECT request in HTTP/QUIC functions in the same manner as in HTTP/2. The
request MUST be formatted as described in {{!RFC7540}}, Section 8.3. A CONNECT
request that does not conform to these restrictions is malformed. The message
data stream MUST NOT be closed at the end of the request.

A proxy that supports CONNECT establishes a TCP connection ({{!RFC0793}}) to the
server identified in the ":authority" pseudo-header field. Once this connection
is successfully established, the proxy sends a HEADERS frame containing a 2xx
series status code to the client, as defined in {{!RFC7231}}, Section 4.3.6, on
the message control stream.

All QUIC STREAM frames on the message data stream correspond to data sent on the
TCP connection. Any QUIC STREAM frame sent by the client is transmitted by the
proxy to the TCP server; data received from the TCP server is written to the
data stream by the proxy. Note that the size and number of TCP segments is not
guaranteed to map predictably to the size and number of QUIC STREAM frames.

The TCP connection can be closed by either peer. When the client half-closes the
data stream, the proxy will set the FIN bit on its connection to the TCP server.
When the proxy receives a packet with the FIN bit set, it will half-close the
corresponding data stream. TCP connections which remain half-closed in a single
direction are not invalid, but are often handled poorly by servers, so clients
SHOULD NOT half-close connections on which they are still expecting data.

A TCP connection error is signaled with RST_STREAM. A proxy treats any error in
the TCP connection, which includes receiving a TCP segment with the RST bit set,
as a stream error of type HTTP_CONNECT_ERROR ({{http-error-codes}}).
Correspondingly, a proxy MUST send a TCP segment with the RST bit set if it
detects an error with the stream or the QUIC connection.

## Stream Priorities {#priority}

HTTP/QUIC uses the priority scheme described in {{!RFC7540}} Section 5.3. In
this priority scheme, a given stream can be designated as dependent upon another
stream, which expresses the preference that the latter stream (the "parent"
stream) be allocated resources before the former stream (the "dependent"
stream). Taken together, the dependencies across all streams in a connection
form a dependency tree. The structure of the dependency tree changes as HEADERS
and PRIORITY frames add, remove, or change the dependency links between streams.

Implicit in this scheme is the notion of in-order delivery of priority changes
(i.e., dependency tree mutations): since operations on the dependency tree such
as reparenting a subtree are not commutative, both sender and receiver must
apply them in the same order to ensure that both sides have a consistent view of
the stream dependency tree. HTTP/2 specifies priority assignments in PRIORITY
frames and (optionally) in HEADERS frames. To achieve in-order delivery of
priority changes in HTTP/QUIC, PRIORITY frames are sent on the connection
control stream and the PRIORITY section is removed from the HEADERS frame. The
semantics of the Stream Dependency, Weight, E flag, and (for HEADERS frames)
PRIORITY flag are the same as in HTTP/2.

For consistency's sake, all PRIORITY frames MUST refer to the message control
stream of the dependent request, not the data stream.


## Flow Control

QUIC provides stream and connection level flow control, similar in principle to
HTTP/2's flow control but with some implementation differences.  As flow control
is handled by QUIC, the HTTP mapping need not concern itself with maintaining
flow control state.  The HTTP mapping MUST NOT send WINDOW_UPDATE frames at the
HTTP level.


## Server Push

HTTP/QUIC supports server push as described in {{!RFC7540}}. During connection
establishment, the client indicates whether it is willing to receive server
pushes via the SETTINGS_ENABLE_PUSH setting in the SETTINGS frame (see
{{connection-establishment}}), which defaults to 1 (true).

As with server push for HTTP/2, the server initiates a server push by sending a
PUSH_PROMISE frame containing the StreamID of the stream to be pushed, as well
as request header fields attributed to the request. The PUSH_PROMISE frame is
sent on the control stream of the associated (client-initiated) request, while
the Promised Stream ID field specifies the Stream ID of the control stream for
the server-initiated request.

The server push response is conveyed in the same way as a non-server-push
response, with response headers and (if present) trailers carried by HEADERS
frames sent on the control stream, and response body (if any) sent via the
corresponding data stream.


# HTTP Framing Layer

Many framing concepts from HTTP/2 can be elided away on QUIC, because the
transport deals with them. Because frames are already on a stream, they can omit
the stream number. Because frames do not block multiplexing (QUIC's multiplexing
occurs below this layer), the support for variable-maximum-length packets can be
removed. Because stream termination is handled by QUIC, an END_STREAM flag is
not required.

Frames are used only on the connection (stream 3) and message (streams 5, 9,
etc.) control streams. Other streams carry data payload and are not framed at
the HTTP layer.

Frame payloads are largely drawn from {{!RFC7540}}. However, QUIC includes some
features (e.g. flow control) which are also present in HTTP/2. In these cases,
the HTTP mapping need not re-implement them. As a result, some frame types are
not required when using QUIC. Where an HTTP/2-defined frame is no longer used,
the frame ID is reserved in order to maximize portability between HTTP/2 and
HTTP/QUIC implementations. However, equivalent frames between the two mappings
are not necessarily identical.

This section describes HTTP framing in QUIC and highlights differences from
HTTP/2 framing.

## Frame Layout

All frames have the following format:

~~~~~~~~~~
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |           Length (16)         |     Type (8)  |   Flags (8)   |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                       Frame Payload (*)                     ...
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~~~~~~
{: title="HTTP/QUIC frame format"}

## Frame Definitions {#frames}

### DATA

DATA frames do not exist.  Frame type 0x0 is reserved.

### HEADERS {#frame-headers}

The HEADERS frame (type=0x1) is used to carry part of a header set, compressed
using HPACK {{!RFC7541}}. Because HEADERS frames from different streams will be
delivered out-of-order and priority-changes are not commutative, the PRIORITY
region of HEADERS is not supported. A separate PRIORITY frame MUST be used.

Padding MUST NOT be used.  The flags defined are:

  Reserved (0x1):
  : Reserved for HTTP/2 compatibility.

  End Header Block (0x4):
  : This frame concludes a header block.

  Reserved (0x8):
  : Reserved for HTTP/2 compatibility.

  Reserved (0x20):
  : Reserved for HTTP/2 compatibility.

A HEADERS frame with the Reserved bits set MUST be treated as a connection error
of type HTTP_MALFORMED_HEADERS.

~~~~~~~~~~
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |       Sequence? (16)          |    Header Block Fragment (*)...
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~~~~~~
{: title="HEADERS frame payload"}

The HEADERS frame payload has the following fields:

  Sequence Number:
  : Present only on the first frame of a header block sequence. This MUST
  be set to zero on the first header block sequence, and incremented on
  each header block.

The next frame on the same stream after a HEADERS frame without the EHB flag set
MUST be another HEADERS frame. A receiver MUST treat the receipt of any other
type of frame as a stream error of type HTTP_INTERRUPTED_HEADERS. (Note that
QUIC can intersperse data from other streams between frames, or even during
transmission of frames, so multiplexing is not blocked by this requirement.)

A full header block is contained in a sequence of zero or more HEADERS frames
without EHB set, followed by a HEADERS frame with EHB set.

On receipt, header blocks (HEADERS, PUSH_PROMISE) MUST be processed by the HPACK
decoder in sequence. If a block is missing, all subsequent HPACK frames MUST be
held until it arrives, or the connection terminated.


### PRIORITY {#frame-priority}

The PRIORITY (type=0x02) frame specifies the sender-advised priority of a stream
and is substantially different from {{!RFC7540}}. In order to support ordering,
it MUST be sent only on the connection control stream. The format has been
modified to accommodate not being sent on-stream and the larger stream ID space
of QUIC.

The flags defined are:

  E (0x01):
  : Indicates that the stream dependency is exclusive (see {{!RFC7540}} Section
    5.3).

~~~~~~~~~~
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                   Prioritized Stream (32)                     |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                    Dependent Stream (32)                      |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |   Weight (8)  |
   +-+-+-+-+-+-+-+-+
~~~~~~~~~~
{: title="HEADERS frame payload"}

The HEADERS frame payload has the following fields:

  Prioritized Stream:
  : A 32-bit stream identifier for the message control stream whose priority is
    being updated.

  Stream Dependency:
  : A 32-bit stream identifier for the stream that this stream depends on (see
    {{priority}} and {!RFC7540}} Section 5.3).

  Weight:
  : An unsigned 8-bit integer representing a priority weight for the stream (see
    {{!RFC7540}} Section 5.3). Add one to the value to obtain a weight between 1
    and 256.

A PRIORITY frame MUST have a payload length of nine octets.  A PRIORITY frame
of any other length MUST be treated as a connection error of type
HTTP_MALFORMED_PRIORITY.

### RST_STREAM

RST_STREAM frames do not exist, since QUIC provides stream lifecycle management.
Frame type 0x3 is reserved.

### SETTINGS {#frame-settings}

The SETTINGS frame (type=0x4) conveys configuration parameters that affect how
endpoints communicate, such as preferences and constraints on peer behavior, and
is substantially different from {{!RFC7540}}. Individually, a SETTINGS parameter
can also be referred to as a "setting".

SETTINGS parameters are not negotiated; they describe characteristics of the
sending peer, which can be used by the receiving peer. However, a negotiation
can be implied by the use of SETTINGS -- a peer uses SETTINGS to advertise a set
of supported values. The recipient can then choose which entries from this list
are also acceptable and proceed with the value it has chosen. (This choice could
be announced in a field of an extension frame, or in its own value in SETTINGS.)

Different values for the same parameter can be advertised by each peer. For
example, a client might permit a very large HPACK state table while a server
chooses to use a small one to conserve memory.

A SETTINGS frame MAY be sent at any time by either endpoint over the lifetime
of the connection.

Each parameter in a SETTINGS frame replaces any existing value for that
parameter. Parameters are processed in the order in which they appear, and a
receiver of a SETTINGS frame does not need to maintain any state other than the
current value of its parameters. Therefore, the value of a SETTINGS parameter is
the last value that is seen by a receiver.

The SETTINGS frame defines the following flag:

  REQUEST_ACK (0x1):
  : When set, bit 0 indicates that this frame contains values which the sender
  wants to know were understood and applied. For more information, see
  {{settings-synchronization}}.

The payload of a SETTINGS frame consists of zero or more parameters, each
consisting of an unsigned 16-bit setting identifier and a length-prefixed binary
value.

~~~~~~~~~~~~~~~
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |        Identifier (16)        |B|        Length (15)          |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                          Contents (?)                       ...
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~~~~~~~~~~~
{: #fig-ext-settings title="SETTINGS value format"}

A zero-length content indicates that the setting value is a Boolean given by the
B bit. If Length is not zero, the B bit MUST be zero, and MUST be ignored by
receivers. The initial value of each setting is "false" unless otherwise
specified by the definition of the setting.

Non-zero-length values MUST be compared against the remaining length of the
SETTINGS frame.  Any value which purports to cross the end of the frame MUST
cause the SETTINGS frame to be considered malformed and trigger a connection
error.

An implementation MUST ignore the contents for any SETTINGS identifier it does
not understand.

SETTINGS frames always apply to a connection, never a single stream, and MUST
only be sent on the connection control stream (Stream 3). If an endpoint
receives an SETTINGS frame whose stream identifier field is anything other than
0x0, the endpoint MUST respond with a connection error of type
HTTP_SETTINGS_ON_WRONG_STREAM.

The SETTINGS frame affects connection state. A badly formed or incomplete
SETTINGS frame MUST be treated as a connection error (Section 5.4.1) of type
HTTP_MALFORMED_SETTINGS.


#### Integer encoding

Settings which are integers are transmitted in network byte order.  Leading
zero octets are permitted, but implementations SHOULD use only as many bytes as
are needed to represent the value.  An integer MUST NOT be represented in more
bytes than would be used to transfer the maximum permitted value.

#### Defined SETTINGS Parameters

Some transport-level options that HTTP/2 specifies via the SETTINGS frame are
superseded by QUIC transport parameters in HTTP/QUIC. Below is a listing of how
each HTTP/2 SETTINGS parameter is mapped:

  SETTINGS_HEADER_TABLE_SIZE:
  : An integer with a maximum value of 2^32 - 1.

  SETTINGS_ENABLE_PUSH:
  : Transmitted as a Boolean.  The default remains "true" as specified in
    {{!RFC7540}}.

  SETTINGS_MAX_CONCURRENT_STREAMS:
  : QUIC requires the maximum number of incoming streams per connection to be
    specified in the initial crypto handshake, using the "MSPC" tag.  Specifying
    SETTINGS_MAX_CONCURRENT_STREAMS in the SETTINGS frame is an error.

  SETTINGS_INITIAL_WINDOW_SIZE:
  : QUIC requires both stream and connection flow control window sizes to be
    specified in the initial crypto handshake, using the "SFCW" and "CFCW" tags,
    respectively.  Specifying SETTINGS_INITIAL_WINDOW_SIZE in the SETTINGS
    frame is an error.

  SETTINGS_MAX_FRAME_SIZE:
  : This setting has no equivalent in QUIC.  Specifying it in the SETTINGS
    frame is an error.

  SETTINGS_MAX_HEADER_LIST_SIZE:
  : An integer with a maximium value of 2^32 - 1.

#### Settings Synchronization {#settings-synchronization}

Some values in SETTINGS benefit from or require an understanding of when the
peer has received and applied the changed parameter values. In order to provide
such synchronization timepoints, the recipient of a SETTINGS frame MUST apply
the updated parameters as soon as possible upon receipt. The values in the
SETTINGS frame MUST be processed in the order they appear, with no other frame
processing between values. Unsupported parameters MUST be ignored.

Once all values have been processed, if the REQUEST_ACK flag was set, the
recipient MUST emit the following frames:

 - On the connection control stream, a SETTINGS_ACK frame
   ({{frame-settings-ack}}) listing the identifiers whose values were not
   understood.

 - On each request control stream which is not in the "half-closed (local)" or
   "closed" state, an empty SETTINGS_ACK frame.

The SETTINGS_ACK frame on the connection control stream contains the highest
stream number which was open at the time the SETTINGS frame was received.  All
streams with higher numbers can safely be assumed to have the new settings in
effect when they open.

For already-open streams including the connection control stream, the
SETTINGS_ACK frame indicates the point at which the new settings took effect, if
they did so before the peer half-closed the stream. If the peer closed the
stream before receiving the SETTINGS frame, the previous settings were in effect
for the full lifetime of that stream.

In certain conditions, the SETTINGS_ACK frame can be the first frame on a given
stream -- this simply indicates that the new settings apply from the beginning
of that stream.

If the sender of a SETTINGS frame with the REQUEST_ACK flag set does not
receive full acknowledgement within a reasonable amount of time, it MAY issue a
connection error ({{errors}}) of type HTTP_SETTINGS_TIMEOUT.  A full
acknowledgement has occurred when:

 - All previous SETTINGS frames have been fully acknowledged,

 - A SETTINGS_ACK frame has been received on the connection control stream,

 - All message control streams with a Stream ID through those given in the
   SETTINGS_ACK frame have either closed or received a SETTINGS_ACK frame.


### PUSH_PROMISE {#frame-push-promise}

The PUSH_PROMISE frame (type=0x05) is used to carry a request header set from
server to client, as in HTTP/2.  It defines no flags.

~~~~~~~~~~
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                   Promised Stream ID (32)                     |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |       Sequence? (16)          |         Header Block (*)    ...
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~~~~~~
{: title="PUSH_PROMISE frame payload"}

The payload consists of:

  Promised Stream ID:
  : A 32-bit Stream ID indicating the QUIC stream on which the response headers
    will be sent.  (The response body stream is implied by the headers stream,
    as defined in {{stream-mapping}}.)

  HPACK Sequence:
  : A sixteen-bit counter, equivalent to the Sequence field in HEADERS

  Payload:
  : HPACK-compressed request headers for the promised response.

TODOs:

 - QUIC stream space may be enlarged; would need to redefine Promised Stream
   field in this case.
 - No CONTINUATION -- HEADERS have EHB; do we need it here?

### SETTINGS_ACK Frame {#frame-settings-ack}

The SETTINGS_ACK frame (id = 0x0b) acknowledges receipt and application
of specific values in the peer's SETTINGS frame. Depending on the stream where
it is sent, it takes two different forms.

On the connection control stream, it contains information about how and when the
sender has processed the most recently-received SETTINGS frame, and has the
following payload:

~~~~~~~~~~~~~~~
    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                   Highest Local Stream (32)                   |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                   Highest Remote Stream (32)                  |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                  Unrecognized Identifiers (*)               ...
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
~~~~~~~~~~~~~~~
{: #fig-settings-ack title="SETTINGS_ACK connection control stream format"}

  Highest Local Stream (32 bits):
  : The highest locally-initiated Stream ID which is not in the "idle" state

  Highest Remote Stream (32 bits):
  : The highest peer-initiated Stream ID which is not in the "idle" state

  Unrecognized Identifiers:
  : A list of 16-bit SETTINGS identifiers which the sender has not understood
    and therefore ignored. This list MAY be empty.

On message control streams, the SETTINGS_ACK frame carries no payload, and is
strictly a synchronization marker for settings application.  See
{{settings-synchronization}} for more detail.  A SETTINGS_ACK frame with a
non-zero length MUST be treated as a connection error of type
HTTP_MALFORMED_SETTINGS_ACK.

On the connection control stream, the SETTINGS_ACK frame MUST have a length
which is a multiple of two octets. A SETTINGS_ACK frame of any other length MUST
be treated as a connection error of type HTTP_MALFORMED_SETTINGS_ACK.

### PING

PING frames do not exist, since QUIC provides equivalent functionality. Frame
type 0x6 is reserved.


### GOAWAY frame

GOAWAY frames do not exist, since QUIC provides equivalent functionality. Frame
type 0x7 is reserved.


### WINDOW_UPDATE frame

WINDOW_UPDATE frames do not exist, since QUIC provides equivalent functionality.
Frame type 0x8 is reserved.


### CONTINUATION frame

CONTINUATION frames do not exist, since larger supported HEADERS/PUSH_PROMISE
frames provide equivalent functionality. Frame type 0x9 is reserved.



# Error Handling {#errors}

This section describes the specific error codes defined by HTTP and the mapping
of HTTP/2 error codes into the QUIC error code space.

## HTTP-Defined QUIC Error Codes {#http-error-codes}

QUIC allocates error codes 0x0000-0x3FFF to application protocol definition.
The following error codes are defined by HTTP for use in QUIC RST_STREAM,
GOAWAY, and CONNECTION_CLOSE frames.

HTTP_SETTINGS_TIMEOUT (0x00):
: After sending a SETTINGS frame which requested acknowledgement, the
  acknowledgement was not completed (see {{settings-synchronization}}) in a
  timely manner.

HTTP_PUSH_REFUSED (0x01):
: The server has attempted to push content which the client will not accept
  on this connection.

HTTP_INTERNAL_ERROR (0x02):
: An internal error has occurred in the HTTP stack.

HTTP_PUSH_ALREADY_IN_CACHE (0x03):
: The server has attempted to push content which the client has cached.

HTTP_REQUEST_CANCELLED (0x04):
: The client no longer needs the requested data.

HTTP_HPACK_DECOMPRESSION_FAILED (0x05):
: HPACK failed to decompress a frame and cannot continue.

HTTP_CONNECT_ERROR (0x06):
: The connection established in response to a CONNECT request was reset or
  abnormally closed.

HTTP_EXCESSIVE_LOAD (0x07):
: The endpoint detected that its peer is exhibiting a behavior that might be
  generating excessive load.

HTTP_VERSION_FALLBACK (0x08):
: The requested operation cannot be served over HTTP/QUIC.  The peer should
  retry over HTTP/2.

HTTP_MALFORMED_HEADERS (0x09):
: A HEADERS frame has been received with an invalid format.

HTTP_MALFORMED_PRIORITY (0x0A):
: A HEADERS frame has been received with an invalid format.

HTTP_MALFORMED_SETTINGS (0x0B):
: A HEADERS frame has been received with an invalid format.

HTTP_MALFORMED_PUSH_PROMISE (0x0C):
: A HEADERS frame has been received with an invalid format.

HTTP_MALFORMED_SETTINGS_ACK (0x0D):
: A HEADERS frame has been received with an invalid format.

HTTP_INTERRUPTED_HEADERS (0x0E):
: A HEADERS frame without the End Header Block flag was followed by a frame
  other than HEADERS.

HTTP_SETTINGS_ON_WRONG_STREAM (0x0F):
: A SETTINGS frame was received on a request control stream.


## Mapping HTTP/2 Error Codes

The HTTP/2 error codes defined in Section 7 of {{!RFC7540}} map to QUIC error
codes as follows:

NO_ERROR (0x0):
: QUIC_NO_ERROR

PROTOCOL_ERROR (0x1):
: No single mapping.  See new HTTP_MALFORMED_* error codes defined in
  {{http-error-codes}}.

INTERNAL_ERROR (0x2)
: HTTP_INTERNAL_ERROR in {{http-error-codes}}.

FLOW_CONTROL_ERROR (0x3):
: Not applicable, since QUIC handles flow control.  Would provoke a
  QUIC_FLOW_CONTROL_RECEIVED_TOO_MUCH_DATA from the QUIC layer.

SETTINGS_TIMEOUT (0x4):
: HTTP_SETTINGS_TIMEOUT in {{http-error-codes}}.

STREAM_CLOSED (0x5):
: Not applicable, since QUIC handles stream management.  Would provoke a
  QUIC_STREAM_DATA_AFTER_TERMINATION from the QUIC layer.

FRAME_SIZE_ERROR (0x6)
: No single mapping.  See new error codes defined in {{http-error-codes}}.

REFUSED_STREAM (0x7):
: Not applicable, since QUIC handles stream management.  Would provoke a
  QUIC_TOO_MANY_OPEN_STREAMS from the QUIC layer.

CANCEL (0x8):
: HTTP_REQUEST_CANCELLED in {{http-error-codes}}.

COMPRESSION_ERROR (0x9):
: HTTP_HPACK_DECOMPRESSION_FAILED in {{http-error-codes}}.

CONNECT_ERROR (0xa):
: HTTP_CONNECT_ERROR in {{http-error-codes}}.

ENHANCE_YOUR_CALM (0xb):
: HTTP_EXCESSIVE_LOAD in {{http-error-codes}}.

INADEQUATE_SECURITY (0xc):
: Not applicable, since QUIC is assumed to provide sufficient security on all
  connections.

HTTP_1_1_REQUIRED (0xd):
: HTTP_VERSION_FALLBACK in {{http-error-codes}}.

TODO: fill in missing error code mappings.


# Security Considerations

The security considerations of HTTP over QUIC should be comparable to those of
HTTP/2.

The modified SETTINGS format contains nested length elements, which could pose
a security risk to an uncautious implementer.  A SETTINGS frame parser MUST
ensure that the length of the frame exactly matches the length of the settings
it contains.


# IANA Considerations

## Registration of HTTP/QUIC Identification String

This document creates a new registration for the identification of HTTP/QUIC in
the "Application Layer Protocol Negotiation (ALPN) Protocol IDs" registry
established in {{?RFC7301}}.

The "hq" string identifies HTTP/QUIC:

  Protocol:
  : HTTP over QUIC

  Identification Sequence:
  : 0x68 0x71 ("hq")

  Specification:
  : This document

## Registration of Version Hint Alt-Svc Parameter

This document creates a new registration for version-negotiation hints in the
"Hypertext Transfer Protocol (HTTP) Alt-Svc Parameter" registry established in
{{!RFC7838}}.

  Parameter:
  : "v"

  Specification:
  : This document, {{alt-svc-version-hint}}

## Existing Frame Types

This document adds two new columns to the "HTTP/2 Frame Type" registry defined
in {{!RFC7540}}:

  Supported Protocols:
  : Indicates which associated protocols use the frame type.  Values MUST be one
    of:

    - "HTTP/2 only"
    - "HTTP/QUIC only"
    - "Both"

  HTTP/QUIC Specification:
  : Indicates where this frame's behavior over QUIC is defined; required
    if the frame is supported over QUIC.

Values for existing registrations are assigned by this document:

  +---------------|---------------------|-------------------------+
  | Frame Type    | Supported Protocols | HTTP/QUIC Specification |
  |---------------|:-------------------:|-------------------------|
  | DATA          | HTTP/2 only         | N/A                     |
  | HEADERS       | Both                | {{frame-headers}}       |
  | PRIORITY      | Both                | {{frame-priority}}      |
  | RST_STREAM    | HTTP/2 only         | N/A                     |
  | SETTINGS      | Both                | {{frame-settings}}      |
  | PUSH_PROMISE  | Both                | {{frame-push-promise}}  |
  | PING          | HTTP/2 only         | N/A                     |
  | GOAWAY        | HTTP/2 only         | N/A                     |
  | WINDOW_UPDATE | HTTP/2 only         | N/A                     |
  | CONTINUATION  | HTTP/2 only         | N/A                     |
  +---------------|---------------------|-------------------------+

The "Specification" column is renamed to "HTTP/2 specification" and is only
required if the frame is supported over HTTP/2.


## New Frame Types

This document adds one new entry to the "HTTP/2 Frame Type" registry defined in
{{!RFC7540}}:

  Frame Type:
  : SETTINGS_ACK

  Code:
  : 0x0b

  HTTP/2 Specification:
  : N/A

  Supported Protocols:
  : HTTP/QUIC only

  HTTP/QUIC Specification:
  : {{frame-settings-ack}}

--- back

# Contributors

The original authors of this specification were Robbie Shade and Mike Warres.

# Change Log

> **RFC Editor's Note:**  Please remove this section prior to publication of a
> final version of this document.

## Since draft-ietf-quic-http-00:

- Changed "HTTP/2-over-QUIC" to "HTTP/QUIC" throughout

- Changed from using HTTP/2 framing within Stream 3 to new framing format and
  two-stream-per-request model

- Adopted SETTINGS format from draft-bishop-httpbis-extended-settings-01

- Reworked SETTINGS_ACK to account for indeterminate inter-stream order.

- Described CONNECT pseudo-method

- Updated ALPN token and Alt-Svc guidance

- Application-layer-defined error codes

## Since draft-shade-quic-http2-mapping-00:

- Adopted as base for draft-ietf-quic-http.

- Updated authors/editors list.

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
    email: Mike.Bishop@microsoft.com
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

Discussion of this draft takes place on the QUIC working group mailing list (quic@ietf.org),
which is archived at <https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source code and issues list
for this draft can be found at <https://github.com/quicwg/base-drafts/labels/http>.


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


# QUIC advertisement

A server advertises that it can speak HTTP-over-QUIC via the Alt-Svc HTTP
response header.  It does so by including the header in any response sent over a
non-QUIC (e.g. HTTP/2) connection:

   Alt-Svc: quic=":443"

In addition, the list of QUIC versions supported by the server can be specified
by the v= parameter.  For example, if a server supported both version 33 and 34
it would specify the following header:

   Alt-Svc: quic=":443"; v="34,33"

On receipt of this header, a client may attempt to establish a QUIC connection
on port 443 and, if successful, send HTTP requests using the mapping described
in this document.

Connectivity problems (e.g. firewall blocking UDP) may result in QUIC connection
establishment failure, in which case the client should gracefully fall back to
HTTP/2.


# Connection establishment

HTTP-over-QUIC connections are established as described in {{QUIC-TRANSPORT}}.
The QUIC crypto handshake MUST use TLS {{QUIC-TLS}}.

While connection-level options pertaining to the core QUIC protocol are set in 
the initial crypto handshake {{QUIC-TLS}}, HTTP-specific settings are conveyed 
in the SETTINGS frame. After the QUIC connection is established, a SETTINGS 
frame ({{frame-settings}}) MUST be sent as the initial frame of the HTTP control
stream (StreamID 3, see {{stream-mapping}}).

# Stream Mapping and Usage {#stream-mapping}

A QUIC stream provides reliable in-order delivery of bytes, but makes no guarantees
about order of delivery with regard to bytes on other streams.
On the wire, data is framed into QUIC STREAM frames, but this framing is 
invisible to the HTTP framing layer. A QUIC receiver buffers and orders received 
STREAM frames, exposing the data contained within as a reliable byte stream to 
the application.

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

1. for a response only, zero or more header blocks (a sequence of HEADERS frames 
with End Header Block set on the last) on the control stream containing the 
message headers of informational (1xx) HTTP responses (see {{!RFC7230}}, Section 
3.2 and {{!RFC7231}}, Section 6.2), 

2. one header block on the control stream containing the message headers (see 
{{!RFC7230}}, Section 3.2), 

3. the payload body (see {{!RFC7230}}, Section 3.3), sent on the data stream 

4. optionally, one header block on the control stream containing the 
trailer-part, if present (see {{!RFC7230}}, Section 4.1.2). 

If the message does not contain a body, the corresponding data stream MUST still 
be half-closed without transferring any data. The "chunked" transfer encoding 
defined in Section 4.1 of {{!RFC7230}} MUST NOT be used. 

Trailing header fields are carried in a header block following the body. Such a 
header block is a sequence of HEADERS frames with End Header Block set on the 
last frame. Header blocks after the first but before the end of the stream are 
invalid. These MUST be decoded to maintain HPACK decoder state, but the 
resulting output MUST be discarded. 

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

HTTP-over-QUIC uses HPACK header compression as described in {{!RFC7541}}. HPACK 
was designed for HTTP/2 with the assumption of in- order delivery such as that 
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


## Stream Priorities {#priority}

HTTP-over-QUIC uses the priority scheme described in {{!RFC7540}} Section 5.3. 
In this priority scheme, a given stream can be designated as dependent upon 
another stream, which expresses the preference that the latter stream (the 
"parent" stream) be allocated resources before the former stream (the 
"dependent" stream). Taken together, the dependencies across all streams in a 
connection form a dependency tree. The structure of the dependency tree changes 
as HEADERS and PRIORITY frames add, remove, or change the dependency links 
between streams.

Implicit in this scheme is the notion of in-order delivery of priority changes 
(i.e., dependency tree mutations): since operations on the dependency tree such 
as reparenting a subtree are not commutative, both sender and receiver must 
apply them in the same order to ensure that both sides have a consistent view of 
the stream dependency tree. HTTP/2 specifies priority assignments in PRIORITY 
frames and (optionally) in HEADERS frames. To achieve in-order delivery of 
priority changes in HTTP-over-QUIC, PRIORITY frames are sent on the connection 
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

HTTP-over-QUIC supports server push as described in {{!RFC7540}}. During 
connection establishment, the client indicates whether or it is willing to 
receive server pushes via the SETTINGS_ENABLE_PUSH setting in the HTTP/2 
SETTINGS frame (see {{connection-establishment}}), which defaults to 1 (true). 

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

Frames are used only on the connection (stream 3) and message (streams 5, 9, etc.)
control streams.  Other streams carry data payload and are not framed at the
HTTP layer.

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
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   |          Length (16)          |
   |                               |
   +---+---+---+---+---+---+---+---+
   |            Type (8)           |  
   +---+---+---+---+---+---+---+---+
   |            Flags (8)          |
   +---+---+---+---+---+---+---+---+
   |        Frame Payload        ...
   +---+---+---+---+---+---+---+---+
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

~~~~~~~~~~
    +-------------------------------+-------------------------------+
    |       Sequence? (16)          |    Header Block Fragment (*)...
    +-------------------------------+-------------------------------+
~~~~~~~~~~
{: title="HEADERS frame payload"}

The HEADERS frame payload has the following fields:

  Sequence Number:
  : Present only on the first frame of a header block sequence. This MUST 
  be set to zero on the first header block sequence, and incremented on 
  each header block. 

The next frame on the same stream after a HEADERS frame without the EHB flag set 
MUST be another HEADERS frame. A receiver MUST treat the receipt of any other 
type of frame as a stream error. (Note that QUIC can intersperse data from other 
streams between frames, or even during transmission of frames, so multiplexing 
is not blocked by this requirement.) 

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
    +---------------------------------------------------------------+
    |                   Prioritized Stream (32)                     |
    +---------------+-----------------------------------------------+
    |                    Dependent Stream (32)                      |
    +---------------+-----------------------------------------------+
    |   Weight (8)  |
    +---------------+
~~~~~~~~~~
{: title="HEADERS frame payload"}

The HEADERS frame payload has the following fields:

  Prioritized Stream:
  : A 32-bit stream identifier for the message control stream whose 
    priority is being updated. 

  Stream Dependency:
  : A 32-bit stream identifier for the stream that this stream depends on 
  (see {{priority}} and {!RFC7540}} Section 5.3).

  Weight:
  : An unsigned 8-bit integer representing a priority weight for the 
  stream (see {{!RFC7540}} Section 5.3). Add one to the value to obtain a 
  weight between 1 and 256.

### RST_STREAM

RST_STREAM frames do not exist, since QUIC provides stream lifecycle management.
Frame type 0x3 is reserved.

### SETTINGS {#frame-settings}

The SETTINGS frame (type=0x04) is unmodified from {{!RFC7540}} (so far). It MUST 
only be sent on the connection control stream (Stream 3). 

As in HTTP/2, additional SETTINGS frames may be sent mid-connection by either 
endpoint. 

TODO:
: Decide whether to acknowledge receipt of SETTINGS through empty SETTINGS
  frames with ACK bit set, as in HTTP/2, or rely on transport- level
  acknowledgment.

#### Defined SETTINGS Parameters
  
Some transport-level options that HTTP/2 specifies via the SETTINGS frame are 
superseded by QUIC transport parameters in HTTP-over-QUIC. Below is a listing of 
how each HTTP/2 SETTINGS parameter is mapped: 

  SETTINGS_HEADER_TABLE_SIZE:
  : Sent in SETTINGS frame.

  SETTINGS_ENABLE_PUSH:
  : Sent in SETTINGS frame (TBD, currently set using QUIC "SPSH" connection
    option)

  SETTINGS_MAX_CONCURRENT_STREAMS
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

  SETTINGS_MAX_HEADER_LIST_SIZE
  : Sent in SETTINGS frame.

As with HTTP/2, unknown SETTINGS parameters are tolerated but ignored. SETTINGS 
parameters are acknowledged by the receiving peer, by sending an empty SETTINGS 
frame in response with the ACK bit set.


### PUSH_PROMISE {#frame-push-promise}

The PUSH_PROMISE frame (type=0x05) is used to carry a request header set from 
server to client, as in HTTP/2.  It defines no flags.

~~~~~~~~~~
    +---------------------------------------------------------------+
    |                   Promised Stream ID (32)                     |
    +-------------------------------+-------------------------------+
    |       Sequence? (16)          |         Header Block (*)    ...
    +-------------------------------+-------------------------------+
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

The HTTP/2 error codes defined in Section 7 of {{!RFC7540}} map to QUIC error
codes as follows:

NO_ERROR (0x0):
: Maps to QUIC_NO_ERROR

PROTOCOL_ERROR (0x1):
: No single mapping?

INTERNAL_ERROR (0x2)
: QUIC_INTERNAL_ERROR? (not currently defined in core protocol spec)

FLOW_CONTROL_ERROR (0x3):
: QUIC_FLOW_CONTROL_RECEIVED_TOO_MUCH_DATA? (not currently defined in core
  protocol spec)

SETTINGS_TIMEOUT (0x4):
: (depends on whether we support SETTINGS acks)

STREAM_CLOSED (0x5):
: QUIC_STREAM_DATA_AFTER_TERMINATION

FRAME_SIZE_ERROR (0x6)
: QUIC_INVALID_FRAME_DATA

REFUSED_STREAM (0x7):
: ?

CANCEL (0x8):
: ?

COMPRESSION_ERROR (0x9):
: QUIC_DECOMPRESSION_FAILURE (not currently defined in core spec)

CONNECT_ERROR (0xa):
: ? (depends whether we decide to support CONNECT)

ENHANCE_YOUR_CALM (0xb):
: ?

INADEQUATE_SECURITY (0xc):
: QUIC_HANDSHAKE_FAILED, QUIC_CRYPTO_NO_SUPPORT

HTTP_1_1_REQUIRED (0xd):
: ?

TODO: fill in missing error code mappings.


# Security Considerations

The security considerations of HTTP over QUIC should be comparable to those of
HTTP/2.


# IANA Considerations

## Frame Types

This document adds two new columns to the "HTTP/2 Frame Type" registry defined in
{{!RFC7540}}:

  Supported in HTTP/QUIC:
  : Indicates whether the frame is also supported in this HTTP/QUIC mapping
  
  HTTP/QUIC Specification:
  : Indicates where this frame's behavior over QUIC is defined; required
    if the frame is supported over QUIC.
  
Values for existing registrations are assigned by this document:

   +---------------|------------------------|-------------------------+
   | Frame Type    | Supported in HTTP/QUIC | HTTP/QUIC Specification |
   |---------------|:----------------------:|-------------------------|
   | DATA          | No                     | N/A                     |
   | HEADERS       | Yes                    | {{frame-headers}}       |
   | PRIORITY      | Yes                    | {{frame-priority}}      |
   | RST_STREAM    | No                     | N/A                     |
   | SETTINGS      | Yes                    | {{frame-settings}}      |
   | PUSH_PROMISE  | Yes                    | {{frame-push-promise}}  |
   | PING          | No                     | N/A                     |
   | GOAWAY        | No                     | N/A                     |
   | WINDOW_UPDATE | No                     | N/A                     |
   | CONTINUATION  | No                     | N/A                     |
   +---------------|------------------------|-------------------------+
   
--- back

# Contributors

The original authors of this specification were Robbie Shade and Mike Warres.

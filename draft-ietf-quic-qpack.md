---
title: "QPACK: Header Compression for HTTP over QUIC"
abbrev: QPACK
docname: draft-ietf-quic-qpack-latest
date: {DATE}
category: std
ipr: trust200902
area: Transport
workgroup: QUIC

stand_alone: yes
pi: [toc, sortrefs, symrefs, docmapping]

author:
 -
    ins: C. Krasic
    name: Charles 'Buck' Krasic
    org: Netflix
    email: ckrasic@netflix.com
 -
    ins: M. Bishop
    name: Mike Bishop
    org: Akamai Technologies
    email: mbishop@evequefou.be
 -
    ins: A. Frindell
    name: Alan Frindell
    org: Facebook
    email: afrind@fb.com
    role: editor


normative:

  QUIC-HTTP:
    title: "Hypertext Transfer Protocol (HTTP) over QUIC"
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

This specification defines QPACK, a compression format for efficiently
representing HTTP header fields, to be used in HTTP over QUIC. This is a
variation of HPACK header compression that seeks to reduce head-of-line
blocking.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/-qpack>.

--- middle

# Introduction

The QUIC transport protocol was designed from the outset to support HTTP
semantics, and its design subsumes many of the features of HTTP/2.  QUIC's
stream multiplexing comes into some conflict with header compression.  A key
goal of the design of QUIC is to improve stream multiplexing relative to HTTP/2
by eliminating HoL (head of line) blocking, which can occur in HTTP/2.  HoL
blocking can happen because all HTTP/2 streams are multiplexed onto a single TCP
connection with its in-order semantics.  QUIC can maintain independence between
streams because it implements core transport functionality in a fully
stream-aware manner.  However, the HTTP/QUIC mapping is still subject to HoL
blocking if HPACK is used directly.  HPACK exploits multiplexing for greater
compression, shrinking the representation of headers that have appeared earlier
on the same connection.  In the context of QUIC, this imposes a vulnerability to
HoL blocking (see {{hol-example}}).

QUIC is described in {{?QUIC-TRANSPORT=I-D.ietf-quic-transport}}.  The HTTP/QUIC
mapping is described in {{QUIC-HTTP}}. For a full
description of HTTP/2, see {{?RFC7540}}. The description of HPACK is
{{!RFC7541}}, with important terminology in Section 1.3.

QPACK modifies HPACK to allow correctness in the presence of out-of-order
delivery, with flexibility for implementations to balance between resilience
against HoL blocking and optimal compression ratio.  The design goals are to
closely approach the compression ratio of HPACK with substantially less
head-of-line blocking under the same loss conditions.

QPACK is intended to be a relatively non-intrusive extension to HPACK; an
implementation should be easily shared within stacks supporting both HTTP/2 over
(TLS+)TCP and HTTP/QUIC.

## Head-of-Line Blocking in HPACK {#hol-example}

HPACK enables several types of header representations, one of which also adds
the header to a dynamic table of header values.  These values are then available
for reuse in subsequent header blocks simply by referencing the entry number in
the table.

If the packet containing a header is lost, that stream cannot complete header
processing until the packet is retransmitted.  This is unavoidable. However,
other streams which rely on the state created by that packet *also* cannot make
progress. This is the problem which QUIC solves in general, but which is
reintroduced by HPACK when the loss includes a HEADERS frame.

## Avoiding Head-of-Line Blocking in HTTP/QUIC {#overview-hol-avoidance}

Because QUIC does not guarantee order between data on different streams, a
header block might reference an entry in the dynamic table that has not yet been
received.

Each header block contains a Largest Reference (see {{absolute-index}}) which
identifies the table state necessary for decoding. If the greatest absolute
index in the dynamic table is less than the value of the Largest Reference, the
stream is considered "blocked."  While blocked, header field data should remain
in the blocked stream's flow control window.  When the Largest Reference is
zero, the frame contains no references to the dynamic table and can always be
processed immediately. A stream becomes unblocked when the greatest absolute
index in the dynamic table becomes greater than or equal to the Largest
Reference for all header blocks the decoder has started reading from the stream.

A decoder can permit the possibility of blocked streams by setting
SETTINGS_QPACK_BLOCKED_STREAMS to a non-zero value.  This setting specifies an
upper bound on the number of streams which can be blocked.

An encoder can decide whether to risk having a stream become blocked. If
permitted by the value of SETTINGS_QPACK_BLOCKED_STREAMS, compression efficiency
can be improved by referencing dynamic table entries that are still in transit,
but if there is loss or reordering the stream can become blocked at the decoder.
An encoder avoids the risk of blocking by only referencing dynamic table entries
which have been acknowledged, but this means using literals. Since literals make
the header block larger, this can result in the encoder becoming blocked on
congestion or flow control limits.

An encoder MUST limit the number of streams which could become blocked to the
value of SETTINGS_QPACK_BLOCKED_STREAMS at all times. Note that the decoder
might not actually become blocked on every stream which risks becoming blocked.
If the decoder encounters more blocked streams than it promised to support, it
SHOULD treat this as a stream error of type HTTP_QPACK_DECOMPRESSION_FAILED.

# Conventions and Definitions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in BCP 14 {{!RFC2119}} {{!RFC8174}}
when, and only when, they appear in all capitals, as shown here.

Definitions of terms that are used in this document:

Header:

: A name-value pair sent as part of an HTTP message.

Header set:

: The full collection of headers associated with an HTTP message.

Header block:

: The compressed representation of a header set.

Encoder:

: An implementation which transforms a header set into a header block.

Decoder:

: An implementation which transforms a header block into a header set.

QPACK is a name, not an acronym.

## Notational Conventions

Diagrams use the format described in Section 3.1 of {{?RFC2360}}, with the
following additional conventions:

x (A)
: Indicates that x is A bits long

x (A+)
: Indicates that x uses the prefixed integer encoding defined in Section 5.1 of
  [RFC7541], beginning with an A-bit prefix.

x ...
: Indicates that x is variable-length and extends to the end of the region.

# Wire Format

QPACK instructions occur in three locations, each of which uses a separate
instruction space:

 - Table updates are carried by a unidirectional stream from encoder to decoder.
   Instructions on this stream modify the dynamic table state without generating
   output to any particular request.
 - Acknowledgements of table modifications and header processing are carried by
   a unidirectional stream from decoder to encoder.
 - Finally, the contents of HEADERS and PUSH_PROMISE frames on request streams
   reference the QPACK table state.

This section describes the instructions which are possible on each stream type.

All table updates occur on the control stream.  Request streams only carry
header blocks that do not modify the state of the table.

## Primitives

The prefixed integer from Section 5.1 of [RFC7541] is used heavily throughout
this document.  The string literal, defined by Section 5.2 of [RFC7541], is used
with the following modification.

HPACK defines string literals to begin on a byte boundary.  They begin with a
single flag (indicating whether the string is Huffman-coded), followed by the
Length encoded as a 7-bit prefix integer, and finally Length octets of data.

QPACK permits strings to begin other than on a byte boundary.  An "N-bit prefix
string literal" begins with the same Huffman flag, followed by the length
encoded as an (N-1)-bit prefix integer.  The remainder of the string literal is
unmodified.

A string literal without a prefix length noted is an 8-bit prefix string literal
and follows the definitions in [RFC7541] without modification.

## Indexing

Entries in the QPACK static and dynamic tables are addressed separately.

Entries in the static table have the same indices at all times.  The static
table is defined in Appendix A of {{!RFC7541}}. Note that because HPACK did not
use zero-based references, there is no value at index zero of the static table.

Entries are inserted into the dynamic table over time.  Each entry possesses
both an absolute index which is fixed for the lifetime of that entry and a
relative index which changes over time based on the context of the reference.
The first entry inserted has an absolute index of "1"; indices
increase sequentially with each insertion.

On the control stream, a relative index of "0" always refers to the most
recently inserted value in the dynamic table.  Note that this means the
entry referenced by a given relative index can change while interpreting
a HEADERS frame as new entries are inserted.

~~~~~ drawing
    +---+---------------+-------+
    | n |      ...      | d + 1 |  Absolute Index
    + - +---------------+   -   +
    | 0 |      ...      | n-d-1 |  Relative Index
    +---+---------------+-------+
      ^                     |
      |                     V
Insertion Point         Dropping Point

n = count of entries inserted
d = count of entries dropped
~~~~~
{: title="Example Dynamic Table Indexing - Control Stream"}

Because frames from request streams can be delivered out of order with
instructions on the control stream, relative indices are relative to the Base
Index at the beginning of the header block (see {{absolute-index}}). The Base
Index is the absolute index of the entry which has the relative index of zero
when interpreting the frame.  The relative indices of entries do not change
while interpreting headers on a request or push stream.

~~~~~ drawing
             Base Index
                 |
                 V
    +---+-----+-----+-----+-------+
    | n | n-1 | n-2 | ... |  d+1  |  Absolute Index
    +---+-----+  -  +-----+   -   +
              |  0  | ... | n-d-3 |  Relative Index
              +-----+-----+-------+

n = count of entries inserted
d = count of entries dropped
~~~~~
{: title="Example Dynamic Table Indexing - Request Stream"}

Entries with an absolute index greater than a frame's Base Index can be
referenced using specific Post-Base instructions.  The relative indices of
Post-Base references count up from Base Index.

~~~~~ drawing
             Base Index
                 |
                 V
    +---+-----+-----+-----+-----+
    | n | n-1 | n-2 | ... | d+1 |  Absolute Index
    +---+-----+-----+-----+-----+
    | 1 |  0  |                    Post-Base Index
    +---+-----+

n = count of entries inserted
d = count of entries dropped
~~~~~
{: title="Dynamic Table Indexing - Post-Base References"}

If the decoder encounters a reference to an entry which has already been dropped
from the table or which is greater than the declared Largest Reference, this
MUST be treated as a stream error of type `HTTP_QPACK_DECOMPRESSION_FAILED`
error code.  If this reference occurs on the control stream, this MUST be
treated as a session error.


## QPACK Encoder Stream

Table updates can add a table entry, possibly using existing entries to avoid
transmitting redundant information.  The name can be transmitted as a reference
to an existing entry in the static or the dynamic table or as a string literal.
For entries which already exist in the dynamic table, the full entry can also be
used by reference, creating a duplicate entry.

Each set of encoder instructions is prefaced by its length, encoded as a
variable length integer with an 8-bit prefix.  Instructions MUST NOT span more
than one block.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   |       Block Length (8+)       |
   +-------------------------------+
   |     Instruction Block (*)   ...
   +-------------------------------+
~~~~~~~~~~
{: title="Encoder instruction block"}

### Insert With Name Reference

An addition to the header table where the header field name matches the header
field name of an entry stored in the static table or the dynamic table starts
with the '1' one-bit pattern.  The `S` bit indicates whether the reference is to
the static (S=1) or dynamic (S=0) table. The header field name is represented
using the relative index of that entry, which is represented as an integer with
a 6-bit prefix (see Section 5.1 of [RFC7541]).

The header name reference is followed by the header field value represented as a
string literal (see Section 5.2 of [RFC7541]).

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 1 | S |    Name Index (6+)    |
   +---+---+-----------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Insert Header Field -- Indexed Name"}


### Insert Without Name Reference

An addition to the header table where both the header field name and the header
field value are represented as string literals (see {{primitives}}) starts with
the '01' two-bit pattern.

The name is represented as a 6-bit prefix string literal, while the value is
represented as an 8-bit prefix string literal.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | 1 | H | Name Length (5+)  |
   +---+---+---+-------------------+
   |  Name String (Length octets)  |
   +---+---------------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Insert Header Field -- New Name"}


### Duplicate {#duplicate}

Duplication of an existing entry in the dynamic table starts with the '000'
three-bit pattern.  The relative index of the existing entry is represented as
an integer with a 5-bit prefix.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | 0 | 0 |    Index (5+)     |
   +---+---+---+-------------------+
~~~~~~~~~~
{:#fig-index-with-duplication title="Duplicate"}

The existing entry is re-inserted into the dynamic table without resending
either the name or the value. This is useful to mitigate the eviction of older
entries which are frequently referenced, both to avoid the need to resend the
header and to avoid the entry in the table blocking the ability to insert new
headers.

### Dynamic Table Size Update

An encoder informs the decoder of a change to the size of the dynamic table
using an instruction which begins with the '001' three-bit pattern.  The new
maximum table size is represented as an integer with a 5-bit prefix (see Section
5.1 of [RFC7541]).

~~~~~~~~~~ drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
| 0 | 0 | 1 |   Max size (5+)   |
+---+---+---+-------------------+
~~~~~~~~~~
{:#fig-size-change title="Maximum Dynamic Table Size Change"}

The new maximum size MUST be lower than or equal to the limit determined by the
protocol using QPACK.  A value that exceeds this limit MUST be treated as a
decoding error.  In HTTP/QUIC, this limit is the value of the
SETTINGS_HEADER_TABLE_SIZE parameter (see [QUIC-HTTP]) received from the
decoder.

Reducing the maximum size of the dynamic table can cause entries to be evicted
(see Section 4.3 of [RFC7541]).  This MUST NOT cause the eviction of entries
with outstanding references (see {{reference-tracking}}).

## QPACK Decoder Stream {#feedback}

The decoder stream carries information used to ensure consistency of the dynamic
table. Information is sent from the QPACK decoder to the QPACK encoder; that is,
the server informs the client about the processing of the client's header blocks
and table updates, and the client informs the server about the processing of the
server's header blocks and table updates.

### Table State Synchronize

After processing a set of instructions on the encoder stream, the decoder will
emit a Table State Synchronize instruction on the decoder stream.  The
instruction begins with the '1' one-bit pattern. The instruction specifies the
total number of dynamic table inserts and duplications since the last Table
State Synchronize, encoded as a 7-bit prefix integer.  The encoder uses this
value to determine which table entries are vulnerable to head-of-line blocking.
A decoder MAY coalesce multiple synchronization updates into a single update.

~~~~~~~~~~ drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
| 1 |     Insert Count (7+)     |
+---+---------------------------+
~~~~~~~~~~
{:#fig-size-sync title="Table Size Synchronize"}

### Header Acknowledgement

After processing a header block on a request or push stream, the decoder emits a
Header Acknowledgement instruction on the decoder stream.  The instruction
begins with the '0' one-bit pattern and includes the request stream's stream ID,
encoded as a 7-bit prefix integer.  It is used by the peer's QPACK encoder to
know when it is safe to evict an entry.

The same Stream ID can be identified multiple times, as multiple header blocks
can be sent on a single stream in the case of intermediate responses, trailers,
and pushed requests.  Since header frames on each stream are received and
processed in order, this gives the encoder precise feedback on which header
blocks within a stream have been fully processed.

~~~~~~~~~~ drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
| 0 |      Stream ID (7+)       |
+---+---------------------------+
~~~~~~~~~~
{:#fig-header-ack title="Header Acknowledgement"}

## Request and Push Streams

HEADERS and PUSH_PROMISE frames on request and push streams reference the
dynamic table in a particular state without modifying it.  Frames on these
streams emit the headers for an HTTP request or response.

### Header Data Prefix {#absolute-index}

Header data is prefixed with two integers, `Largest Reference` and `Base Index`.

~~~~~~~~~~  drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
|     Largest Reference (8+)    |
+---+---------------------------+
| S |   Delta Base Index (7+)   |
+---+---------------------------+
|      Compressed Headers     ...
+-------------------------------+
~~~~~~~~~~
{:#fig-base-index title="Frame Payload"}

`Largest Reference` identifies the largest absolute dynamic index referenced in
the block.  Blocking decoders use the Largest Reference to determine when it is
safe to process the rest of the block.

`Base Index` is used to resolve references in the dynamic table as described in
{{indexing}}.  To save space, Base Index is encoded relative to Largest
Reference using a one-bit sign flag.

    baseIndex = largestReference + deltaBaseIndex

If the encoder inserted entries to the table while the encoding the block,
Largest Reference will be greater than Base Index, so deltaBaseIndex will be
negative and encoded with S=1.  If the block did not reference the most recent
entry in the table and did not insert any new entries, Largest Reference will be
less than Base Index, so deltaBaseIndex will be positive and encoded with S=0.
When Largest Reference and Base Index are equal, deltaBaseIndex is 0 and encoded
with S=0.


### Instructions

#### Indexed Header Field

An indexed header field representation identifies an entry in either the static
table or the dynamic table and causes that header field to be added to the
decoded header list, as described in Section 3.2 of [RFC7541].

~~~~~~~~~~ drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
| 1 | S |      Index (6+)       |
+---+---+-----------------------+
~~~~~~~~~~
{: title="Indexed Header Field"}

If the entry is in the static table, or in the dynamic table with an absolute
index less than or equal to Base Index, this representation starts with the '1'
1-bit pattern, followed by the `S` bit indicating whether the reference is into
the static (S=1) or dynamic (S=0) table. Finally, the relative index of the
matching header field is represented as an integer with a 6-bit prefix (see
Section 5.1 of [RFC7541]).

~~~~~~~~~~ drawing
  0   1   2   3   4   5   6   7
+---+---+---+---+---+---+---+---+
| 0 | 1 | 0 | 0 |  Index (4+)   |
+---+---+-----------------------+
~~~~~~~~~~
{: title="Indexed Header Field"}

If the entry is in the dynamic table with an absolute index greater than Base
Index, the representation starts with the '0100' 4-bit pattern, followed by the
post-base index (see {{indexing}}) of the matching header field, represented as
an integer with a 4-bit prefix (see Section 5.1 of [RFC7541]).

#### Literal Header Field With Name Reference

A literal header field with a name reference represents a header where the
header field name matches the header field name of an entry stored in the static
table or the dynamic table.

If the entry is in the static table, or in the dynamic table with an absolute
index less than or equal to Base Index, this representation starts with the '00'
two-bit pattern.  If the entry is in the dynamic table with an absolute index
greater than Base Index, the representation starts with the '0101' four-bit
pattern.

The following bit, 'N', indicates whether an intermediary is permitted to add
this header to the dynamic header table on subsequent hops. When the 'N' bit is
set, the encoded header MUST always be encoded with a literal representation. In
particular, when a peer sends a header field that it received represented as a
literal header field with the 'N' bit set, it MUST use a literal representation
to forward this header field.  This bit is intended for protecting header field
values that are not to be put at risk by compressing them (see Section 7.1 of
[RFC7541] for more details).

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | 0 | N | S |Name Index (4+)|
   +---+---+-----------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Literal Header Field With Name Reference"}

For entries in the static table or in the dynamic table with an absolute index
less than or equal to Base Index, the header field name is represented using the
relative index of that entry, which is represented as an integer with a 4-bit
prefix (see Section 5.1 of [RFC7541]). The `S` bit indicates whether the
reference is to the static (S=1) or dynamic (S=0) table.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | 1 | 0 | 1 | N |NameIdx(3+)|
   +---+---+-----------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Literal Header Field With Post-Base Name Reference"}

For entries in the dynamic table with an absolute index greater than Base Index,
the header field name is represented using the post-base index of that entry
(see {{indexing}}) encoded as an integer with a 3-bit prefix.

#### Literal Header Field Without Name Reference

An addition to the header table where both the header field name and the header
field value are represented as string literals (see {{primitives}}) starts with
the '011' three-bit pattern.

The fourth bit, 'N', indicates whether an intermediary is permitted to add this
header to the dynamic header table on subsequent hops. When the 'N' bit is set,
the encoded header MUST always be encoded with a literal representation. In
particular, when a peer sends a header field that it received represented as a
literal header field with the 'N' bit set, it MUST use a literal representation
to forward this header field.  This bit is intended for protecting header field
values that are not to be put at risk by compressing them (see Section 7.1 of
[RFC7541] for more details).

The name is represented as a 4-bit prefix string literal, while the value is
represented as an 8-bit prefix string literal.

~~~~~~~~~~ drawing
     0   1   2   3   4   5   6   7
   +---+---+---+---+---+---+---+---+
   | 0 | 1 | 1 | N | H |NameLen(3+)|
   +---+---+---+-------------------+
   |  Name String (Length octets)  |
   +---+---------------------------+
   | H |     Value Length (7+)     |
   +---+---------------------------+
   | Value String (Length octets)  |
   +-------------------------------+
~~~~~~~~~~
{: title="Literal Header Field Without Name Reference"}

# Encoding Strategies

## Single pass encoding

An encoder making a single pass over a list of headers must choose Base Index
before knowing Largest Reference.  When trying to reference a header inserted to
the table after encoding has begun, the entry is encoded with different
instructions that tell the decoder to use an absolute index greater than the
Base Index.

## Preventing Eviction Races {#evictions}

Due to out-of-order arrival, QPACK's eviction algorithm requires changes
(relative to HPACK) to avoid the possibility that an indexed representation is
decoded after the referenced entry has already been evicted.  QPACK employs a
two-phase eviction algorithm, in which the encoder will not evict entries that
have outstanding (unacknowledged) references.

## Reference Tracking

An encoder MUST ensure that a header block which references a dynamic table
entry is not received by the decoder after the referenced entry has already been
evicted.  An encoder also respects the limit set by the decoder on the number of
streams that are allowed to become blocked. Even if the decoder is willing to
tolerate blocked streams, the encoder might choose to avoid them in certain
cases.

In order to enable this, the encoder will need to track outstanding
(unacknowledged) header blocks and table updates using feedback received from
the decoder.

### Blocked Eviction

The encoder MUST NOT permit an entry to be evicted while a reference to that
entry remains unacknowledged.  If a new header to be inserted into the dynamic
table would cause the eviction of such an entry, the encoder MUST NOT emit the
insert instruction until the reference has been processed by the decoder and
acknowledged.

The encoder can emit a literal representation for the new header in order to
avoid encoding delays, and MAY insert the header into the table later if
desired.

To ensure that the blocked eviction case is rare, references to the oldest
entries in the dynamic table SHOULD be avoided.  When one of the oldest entries
in the table is still actively used for references, the encoder SHOULD emit an
Duplicate representation instead (see {{duplicate}}).


### Blocked Decoding

For header blocks encoded in non-blocking mode, the encoder needs to forego
indexed representations that refer to table updates which have not yet been
acknowledged with {{feedback}}.  Since all table updates are processed in
sequence on the control stream, an index into the dynamic table is sufficient to
track which entries have been acknowledged.

To track blocked streams, the necessary Base Index value for each stream
can be used.  Whenever the decoder processes a table update, it can begin
decoding any blocked streams that now have their dependencies satisfied.


## Speculative table updates {#speculative-updates}

Implementations can *speculatively* send header frames on the HTTP Control
Streams which are not needed for any current HTTP request or response.  Such
headers could be used strategically to improve performance.  For instance, the
encoder might decide to *refresh* by sending Duplicate representations for
popular header fields ({{duplicate}}), ensuring they have small indices and
hence minimal size on the wire.

## Sample One Pass Encoding Algorithm

Pseudo-code for single pass encoding, excluding handling of duplicates,
non-blocking mode, and reference tracking.

~~~
baseIndex = dynamicTable.baseIndex
largestReference = 0
for header in headers:
  staticIdx = staticTable.getIndex(header)
  if staticIdx:
    encodeIndexReference(streamBuffer, staticIdx)
    continue

  dynamicIdx = dynamicTable.getIndex(header)
  if !dynamicIdx:
    # No matching entry.  Either insert+index or encode literal
    nameIdx = getNameIndex(header)
    if shouldIndex(header) and dynamicTable.canIndex(header):
      encodeLiteralWithIncrementalIndex(controlBuffer, nameIdx,
                                        header)
      dynamicTable.add(header)
      dynamicIdx = dynamicTable.baseIndex

  if !dynamicIdx:
    # Couldn't index it, literal
    if nameIdx <= staticTable.size:
      encodeLiteral(streamBuffer, nameIndex, header)
    else:
      # encode literal, possibly with nameIdx above baseIndex
      encodeDynamicLiteral(streamBuffer, nameIndex, baseIndex,
                           header)
      largestReference = max(largestReference,
                             dynamicTable.toAbsolute(nameIdx))
  else:
    # Dynamic index reference
    assert(dynamicIdx)
    largestReference = max(largestReference, dynamicIdx)
    # Encode dynamicIdx, possibly with dynamicIdx above baseIndex
    encodeDynamicIndexReference(streamBuffer, dynamicIdx,
                                baseIndex)

# encode the prefix
encodeInteger(prefixBuffer, 0x00, largestReference, 8)
delta = largestReference - baseIndex
sign = delta > 0 ? 0x80 : 0
encodeInteger(prefixBuffer, sign, delta, 7)

return controlBuffer, prefixBuffer + streamBuffer
~~~

# Security Considerations

TBD.

# IANA Considerations

None.

--- back

# Change Log

> **RFC Editor's Note:**  Please remove this section prior to publication of a
> final version of this document.

## Since draft-ietf-quic-qcram-00

- Separate instruction sets for table updates and header blocks (#1235, #1142,
  #1141)
- Reworked indexing scheme (#1176, #1145, #1136, #1130, #1125, #1314)
- Added mechanisms that support one-pass encoding (#1138, #1320)
- Added a setting to control the number of blocked decoders (#238, #1140, #1143)
- Moved table updates and acknowledgments to dedicated streams (#1121, #1122,
  #1238)


# Acknowledgments
{:numbered="false"}

This draft draws heavily on the text of {{!RFC7541}}.  The indirect input of
those authors is gratefully acknowledged, as well as ideas from:

* Ryan Hamilton

* Patrick McManus

* Kazuho Oku

* Biren Roy

* Ian Swett

* Dmitri Tikhonov

Buck's contribution was supported by Google during his employment there.

A substantial portion of Mike's contribution was supported by Microsoft during
his employment there.

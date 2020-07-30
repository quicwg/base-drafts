---
title: QUIC Loss Detection and Congestion Control
abbrev: QUIC Loss Detection
docname: draft-ietf-quic-recovery-latest
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
    org: Fastly
    email: jri.ietf@gmail.com
    role: editor
 -
    ins: I. Swett
    name: Ian Swett
    org: Google
    email: ianswett@google.com
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

  QUIC-TLS:
    title: "Using TLS to Secure QUIC"
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

  FACK:
    title: "Forward Acknowledgement: Refining TCP Congestion Control"
    author:
      - ins: M. Mathis
      - ins: J. Mahdavi
    date: 1996-08
    seriesinfo: ACM SIGCOMM

--- abstract

This document describes loss detection and congestion control mechanisms for
QUIC.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
([quic@ietf.org](mailto:quic@ietf.org)), which is archived at
[](https://mailarchive.ietf.org/arch/search/?email_list=quic).

Working Group information can be found at [](https://github.com/quicwg); source
code and issues list for this draft can be found at
[](https://github.com/quicwg/base-drafts/labels/-recovery).

--- middle

# Introduction

QUIC is a new multiplexed and secure transport protocol atop UDP, specified in
{{QUIC-TRANSPORT}}. This document describes congestion control and loss
recovery for QUIC. Mechanisms described in this document follow the spirit
of existing TCP congestion control and loss recovery mechanisms, described in
RFCs, various Internet-drafts, or academic papers, and also those prevalent in
TCP implementations.

# Conventions and Definitions

{::boilerplate bcp14}

Definitions of terms that are used in this document:

Ack-eliciting frames:

: All frames other than ACK, PADDING, and CONNECTION_CLOSE are considered
  ack-eliciting.

Ack-eliciting packets:

: Packets that contain ack-eliciting frames elicit an ACK from the receiver
  within the maximum acknowledgement delay and are called ack-eliciting packets.

In-flight:

: Packets are considered in-flight when they are ack-eliciting or contain a
  PADDING frame, and they have been sent but are not acknowledged, declared
  lost, or discarded along with old keys.

# Design of the QUIC Transmission Machinery

All transmissions in QUIC are sent with a packet-level header, which indicates
the encryption level and includes a packet sequence number (referred to below as
a packet number).  The encryption level indicates the packet number space, as
described in {{QUIC-TRANSPORT}}.  Packet numbers never repeat within a packet
number space for the lifetime of a connection.  Packet numbers are sent in
monotonically increasing order within a space, preventing ambiguity.

This design obviates the need for disambiguating between transmissions and
retransmissions; this eliminates significant complexity from QUIC's
interpretation of TCP loss detection mechanisms.

QUIC packets can contain multiple frames of different types. The recovery
mechanisms ensure that data and frames that need reliable delivery are
acknowledged or declared lost and sent in new packets as necessary. The types
of frames contained in a packet affect recovery and congestion control logic:

* All packets are acknowledged, though packets that contain no
  ack-eliciting frames are only acknowledged along with ack-eliciting
  packets.

* Long header packets that contain CRYPTO frames are critical to the
  performance of the QUIC handshake and use shorter timers for
  acknowledgement.

* Packets containing frames besides ACK or CONNECTION_CLOSE frames count toward
  congestion control limits and are considered in-flight.

* PADDING frames cause packets to contribute toward bytes in flight without
  directly causing an acknowledgment to be sent.

# Relevant Differences Between QUIC and TCP

Readers familiar with TCP's loss detection and congestion control will find
algorithms here that parallel well-known TCP ones. However, protocol differences
between QUIC and TCP contribute to algorithmic differences. These protocol
differences are briefly described below.

## Separate Packet Number Spaces

QUIC uses separate packet number spaces for each encryption level, except 0-RTT
and all generations of 1-RTT keys use the same packet number space.  Separate
packet number spaces ensures acknowledgement of packets sent with one level of
encryption will not cause spurious retransmission of packets sent with a
different encryption level.  Congestion control and round-trip time (RTT)
measurement are unified across packet number spaces.

## Monotonically Increasing Packet Numbers

TCP conflates transmission order at the sender with delivery order at the
receiver, which results in retransmissions of the same data carrying the same
sequence number, and consequently leads to "retransmission ambiguity".  QUIC
separates the two. QUIC uses a packet number to indicate transmission order.
Application data is sent in one or more streams and delivery order is
determined by stream offsets encoded within STREAM frames.

QUIC's packet number is strictly increasing within a packet number space,
and directly encodes transmission order.  A higher packet number signifies
that the packet was sent later, and a lower packet number signifies that
the packet was sent earlier.  When a packet containing ack-eliciting
frames is detected lost, QUIC includes necessary frames in a new packet
with a new packet number, removing ambiguity about which packet is
acknowledged when an ACK is received.  Consequently, more accurate RTT
measurements can be made, spurious retransmissions are trivially detected, and
mechanisms such as Fast Retransmit can be applied universally, based only on
packet number.

This design point significantly simplifies loss detection mechanisms for QUIC.
Most TCP mechanisms implicitly attempt to infer transmission ordering based on
TCP sequence numbers - a non-trivial task, especially when TCP timestamps are
not available.

## Clearer Loss Epoch

QUIC starts a loss epoch when a packet is lost and ends one when any packet
sent after the epoch starts is acknowledged.  TCP waits for the gap in the
sequence number space to be filled, and so if a segment is lost multiple times
in a row, the loss epoch may not end for several round trips. Because both
should reduce their congestion windows only once per epoch, QUIC will do it
once for every round trip that experiences loss, while TCP may only do it
once across multiple round trips.

## No Reneging

QUIC ACKs contain information that is similar to TCP SACK, but QUIC does not
allow any acknowledged packet to be reneged, greatly simplifying implementations
on both sides and reducing memory pressure on the sender.

## More ACK Ranges

QUIC supports many ACK ranges, opposed to TCP's 3 SACK ranges.  In high loss
environments, this speeds recovery, reduces spurious retransmits, and ensures
forward progress without relying on timeouts.

## Explicit Correction For Delayed Acknowledgements

QUIC endpoints measure the delay incurred between when a packet is received and
when the corresponding acknowledgment is sent, allowing a peer to maintain a
more accurate round-trip time estimate; see Section 13.2 of {{QUIC-TRANSPORT}}.

## Probe Timeout Replaces RTO and TLP

QUIC uses a probe timeout (PTO; see {{pto}}), with a timer based on TCP's RTO
computation.  QUIC's PTO includes the peer's maximum expected acknowledgement
delay instead of using a fixed minimum timeout. QUIC does not collapse the
congestion window until persistent congestion ({{persistent-congestion}}) is
declared, unlike TCP, which collapses the congestion window upon expiry of an
RTO.  Instead of collapsing the congestion window and declaring everything
in-flight lost, QUIC allows probe packets to temporarily exceed the congestion
window whenever the timer expires.

In doing this, QUIC avoids unnecessary congestion window reductions, obviating
the need for correcting mechanisms such as F-RTO ({{?RFC5682}}). Since QUIC does
not collapse the congestion window on a PTO expiration, a QUIC sender is not
limited from sending more in-flight packets after a PTO expiration if it still
has available congestion window. This occurs when a sender is
application-limited and the PTO timer expires. This is more aggressive than
TCP's RTO mechanism when application-limited, but identical when not
application-limited.

A single packet loss at the tail does not indicate persistent congestion, so
QUIC specifies a time-based definition to ensure one or more packets are sent
prior to a dramatic decrease in congestion window; see
{{persistent-congestion}}.

## The Minimum Congestion Window is Two Packets

TCP uses a minimum congestion window of one packet. However, loss of
that single packet means that the sender needs to waiting for a PTO
({{pto}}) to recover, which can be much longer than a round-trip time.
Sending a single ack-eliciting packet also increases the chances of incurring
additional latency when a receiver delays its acknowledgement.

QUIC therefore recommends that the minimum congestion window be two
packets. While this increases network load, it is considered safe, since the
sender will still reduce its sending rate exponentially under persistent
congestion ({{pto}}).


# Estimating the Round-Trip Time {#compute-rtt}

At a high level, an endpoint measures the time from when a packet was sent to
when it is acknowledged as a round-trip time (RTT) sample.  The endpoint uses
RTT samples and peer-reported host delays (see Section 13.2 of
{{QUIC-TRANSPORT}}) to generate a statistical description of the network
path's RTT. An endpoint computes the following three values for each path:
the minimum value observed over the lifetime of the path (min_rtt), an
exponentially-weighted moving average (smoothed_rtt), and the mean deviation
(referred to as "variation" in the rest of this document) in the observed RTT
samples (rttvar).

## Generating RTT samples {#latest-rtt}

An endpoint generates an RTT sample on receiving an ACK frame that meets the
following two conditions:

- the largest acknowledged packet number is newly acknowledged, and

- at least one of the newly acknowledged packets was ack-eliciting.

The RTT sample, latest_rtt, is generated as the time elapsed since the largest
acknowledged packet was sent:

~~~
latest_rtt = ack_time - send_time_of_largest_acked
~~~

An RTT sample is generated using only the largest acknowledged packet in the
received ACK frame.  This is because a peer reports acknowledgment delays for
only the largest acknowledged packet in an ACK frame.  While the reported
acknowledgment delay is not used by the RTT sample measurement, it is used to
adjust the RTT sample in subsequent computations of smoothed_rtt and rttvar
({{smoothed-rtt}}).

To avoid generating multiple RTT samples for a single packet, an ACK frame
SHOULD NOT be used to update RTT estimates if it does not newly acknowledge the
largest acknowledged packet.

An RTT sample MUST NOT be generated on receiving an ACK frame that does not
newly acknowledge at least one ack-eliciting packet. A peer usually does not
send an ACK frame when only non-ack-eliciting packets are received. Therefore
an ACK frame that contains acknowledgements for only non-ack-eliciting packets
could include an arbitrarily large ACK Delay value.  Ignoring
such ACK frames avoids complications in subsequent smoothed_rtt and rttvar
computations.

A sender might generate multiple RTT samples per RTT when multiple ACK frames
are received within an RTT.  As suggested in {{?RFC6298}}, doing so might result
in inadequate history in smoothed_rtt and rttvar.  Ensuring that RTT estimates
retain sufficient history is an open research question.

## Estimating min_rtt {#min-rtt}

min_rtt is the minimum RTT observed for a given network path.  min_rtt is set
to the latest_rtt on the first RTT sample, and to the lesser of min_rtt and
latest_rtt on subsequent samples.  In this document, min_rtt is used by loss
detection to reject implausibly small rtt samples.

An endpoint uses only locally observed times in computing the min_rtt and does
not adjust for acknowledgment delays reported by the peer.  Doing so allows the
endpoint to set a lower bound for the smoothed_rtt based entirely on what it
observes (see {{smoothed-rtt}}), and limits potential underestimation due to
erroneously-reported delays by the peer.

The RTT for a network path may change over time.  If a path's actual RTT
decreases, the min_rtt will adapt immediately on the first low sample.  If
the path's actual RTT increases, the min_rtt will not adapt to it, allowing
future RTT samples that are smaller than the new RTT to be included in
smoothed_rtt.

## Estimating smoothed_rtt and rttvar {#smoothed-rtt}

smoothed_rtt is an exponentially-weighted moving average of an endpoint's RTT
samples, and rttvar is the variation in the RTT samples, estimated using a
mean variation.

The calculation of smoothed_rtt uses path latency after adjusting RTT samples
for acknowledgement delays. These delays are computed using the ACK Delay field
of the ACK frame as described in Section 19.3 of {{QUIC-TRANSPORT}}. For packets
sent in the Application Data packet number space, a peer limits any delay in
sending an acknowledgement for an ack-eliciting packet to no greater than the
value it advertised in the max_ack_delay transport parameter. Consequently, when
a peer reports an acknowledgment delay that is greater than its max_ack_delay,
the delay is attributed to reasons out of the peer's control, such as scheduler
latency at the peer or loss of previous ACK frames.  Any delays beyond the
peer's max_ack_delay are therefore considered effectively part of path delay and
incorporated into the smoothed_rtt estimate.

When adjusting an RTT sample using peer-reported acknowledgement delays, an
endpoint:

- MUST ignore the ACK Delay field of the ACK frame for packets sent in the
  Initial and Handshake packet number space.

- MUST use the lesser of the value reported in ACK Delay field of the ACK frame
  and the peer's max_ack_delay transport parameter.

- MUST NOT apply the adjustment if the resulting RTT sample is smaller than the
  min_rtt.  This limits the underestimation that a misreporting peer can cause
  to the smoothed_rtt.

smoothed_rtt and rttvar are computed as follows, similar to {{?RFC6298}}.

When there are no samples for a network path, and on the first RTT sample for
the network path:

~~~
smoothed_rtt = rtt_sample
rttvar = rtt_sample / 2
~~~

Before any RTT samples are available, the initial RTT is used as rtt_sample.  On
the first RTT sample for the network path, that sample is used as rtt_sample.
This ensures that the first measurement erases the history of any persisted or
default values.

On subsequent RTT samples, smoothed_rtt and rttvar evolve as follows:

~~~
ack_delay = min(acknowledgement delay from ACK frame, max_ack_delay)
adjusted_rtt = latest_rtt
if (min_rtt + ack_delay < latest_rtt):
  adjusted_rtt = latest_rtt - ack_delay
smoothed_rtt = 7/8 * smoothed_rtt + 1/8 * adjusted_rtt
rttvar_sample = abs(smoothed_rtt - adjusted_rtt)
rttvar = 3/4 * rttvar + 1/4 * rttvar_sample
~~~


# Loss Detection {#loss-detection}

QUIC senders use acknowledgements to detect lost packets, and a probe
time out (see {{pto}}) to ensure acknowledgements are received. This section
provides a description of these algorithms.

If a packet is lost, the QUIC transport needs to recover from that loss, such
as by retransmitting the data, sending an updated frame, or discarding the
frame.  For more information, see Section 13.3 of {{QUIC-TRANSPORT}}.

Loss detection is separate per packet number space, unlike RTT measurement and
congestion control, because RTT and congestion control are properties of the
path, whereas loss detection also relies upon key availability.

## Acknowledgement-Based Detection {#ack-loss-detection}

Acknowledgement-based loss detection implements the spirit of TCP's Fast
Retransmit ({{?RFC5681}}), Early Retransmit ({{?RFC5827}}), FACK ({{FACK}}),
SACK loss recovery ({{?RFC6675}}), and RACK ({{?RACK=I-D.ietf-tcpm-rack}}). This
section provides an overview of how these algorithms are implemented in QUIC.

A packet is declared lost if it meets all the following conditions:

* The packet is unacknowledged, in-flight, and was sent prior to an
  acknowledged packet.

* Either its packet number is kPacketThreshold smaller than an acknowledged
  packet ({{packet-threshold}}), or it was sent long enough in the past
  ({{time-threshold}}).

The acknowledgement indicates that a packet sent later was delivered, and the
packet and time thresholds provide some tolerance for packet reordering.

Spuriously declaring packets as lost leads to unnecessary retransmissions and
may result in degraded performance due to the actions of the congestion
controller upon detecting loss.  Implementations can detect spurious
retransmissions and increase the reordering threshold in packets or time to
reduce future spurious retransmissions and loss events. Implementations with
adaptive time thresholds MAY choose to start with smaller initial reordering
thresholds to minimize recovery latency.

### Packet Threshold {#packet-threshold}

The RECOMMENDED initial value for the packet reordering threshold
(kPacketThreshold) is 3, based on best practices for TCP loss detection
({{?RFC5681}}, {{?RFC6675}}).  In order to remain similar to TCP,
implementations SHOULD NOT use a packet threshold less than 3; see {{?RFC5681}}.

Some networks may exhibit higher degrees of packet reordering, causing a sender
to detect spurious losses. Additionally, packet reordering could be more common
with QUIC than TCP, because network elements that could observe and fix the
order of reordered TCP packets cannot do that for QUIC. Algorithms that increase
the reordering threshold after spuriously detecting losses, such as RACK
{{?RACK}}, have proven to be useful in TCP and are expected to at least as
useful in QUIC.

### Time Threshold {#time-threshold}

Once a later packet within the same packet number space has been acknowledged,
an endpoint SHOULD declare an earlier packet lost if it was sent a threshold
amount of time in the past. To avoid declaring packets as lost too early, this
time threshold MUST be set to at least the local timer granularity, as
indicated by the kGranularity constant.  The time threshold is:

~~~
max(kTimeThreshold * max(smoothed_rtt, latest_rtt), kGranularity)
~~~

If packets sent prior to the largest acknowledged packet cannot yet be declared
lost, then a timer SHOULD be set for the remaining time.

Using max(smoothed_rtt, latest_rtt) protects from the two following cases:

* the latest RTT sample is lower than the smoothed RTT, perhaps due to
  reordering where the acknowledgement encountered a shorter path;

* the latest RTT sample is higher than the smoothed RTT, perhaps due to a
  sustained increase in the actual RTT, but the smoothed RTT has not yet caught
  up.

The RECOMMENDED time threshold (kTimeThreshold), expressed as a round-trip time
multiplier, is 9/8. The RECOMMENDED value of the timer granularity
(kGranularity) is 1ms.

Implementations MAY experiment with absolute thresholds, thresholds from
previous connections, adaptive thresholds, or including RTT variation.  Smaller
thresholds reduce reordering resilience and increase spurious retransmissions,
and larger thresholds increase loss detection delay.


## Probe Timeout {#pto}

A Probe Timeout (PTO) triggers sending one or two probe datagrams when
ack-eliciting packets are not acknowledged within the expected period of
time or the server may not have validated the client's address.  A PTO enables
a connection to recover from loss of tail packets or acknowledgements.

A PTO timer expiration event does not indicate packet loss and MUST NOT cause
prior unacknowledged packets to be marked as lost. When an acknowledgement
is received that newly acknowledges packets, loss detection proceeds as
dictated by packet and time threshold mechanisms; see {{ack-loss-detection}}.

As with loss detection, the probe timeout is per packet number space. The PTO
algorithm used in QUIC implements the reliability functions of Tail Loss Probe
({{?RACK}}), RTO ({{?RFC5681}}), and F-RTO ({{?RFC5682}}) algorithms for TCP.
The timeout computation is based on TCP's retransmission timeout period
({{?RFC6298}}).

### Computing PTO

When an ack-eliciting packet is transmitted, the sender schedules a timer for
the PTO period as follows:

~~~
PTO = smoothed_rtt + max(4*rttvar, kGranularity) + max_ack_delay
~~~

The PTO period is the amount of time that a sender ought to wait for an
acknowledgement of a sent packet.  This time period includes the estimated
network round-trip time (smoothed_rtt), the variation in the estimate
(4*rttvar), and max_ack_delay, to account for the maximum time by which a
receiver might delay sending an acknowledgement.  When the PTO is armed for
Initial or Handshake packet number spaces, the max_ack_delay is 0, as specified
in 13.2.1 of {{QUIC-TRANSPORT}}.

The PTO value MUST be set to at least kGranularity, to avoid the timer expiring
immediately.

A sender recomputes and may need to reset its PTO timer every time an
ack-eliciting packet is sent or acknowledged, when the handshake is confirmed,
or when Initial or Handshake keys are discarded. This ensures the PTO is always
set based on the latest RTT information and for the last sent packet in the
correct packet number space.

When ack-eliciting packets in multiple packet number spaces are in flight,
the timer MUST be set for the packet number space with the earliest timeout,
with one exception. The Application Data packet number space (Section 4.1.1
of {{QUIC-TLS}}) MUST be ignored until the handshake completes. Not arming
the PTO for Application Data prevents a client from retransmitting a 0-RTT
packet on a PTO expiration before confirming that the server is able to
decrypt 0-RTT packets, and prevents a server from sending a 1-RTT packet on
a PTO expiration before it has the keys to process an acknowledgement.

When a PTO timer expires, the PTO backoff MUST be increased, resulting in the
PTO period being set to twice its current value. The PTO backoff factor is reset
when an acknowledgement is received, except in the following case. A server
might take longer to respond to packets during the handshake than otherwise.  To
protect such a server from repeated client probes, the PTO backoff is not reset
at a client that is not yet certain that the server has finished validating the
client's address. That is, a client does not reset the PTO backoff factor on
receiving acknowledgements until it receives a HANDSHAKE_DONE frame or an
acknowledgement for one of its Handshake or 1-RTT packets.

This exponential reduction in the sender's rate is important because
consecutive PTOs might be caused by loss of packets or acknowledgements due to
severe congestion.  Even when there are ack-eliciting packets in-flight in
multiple packet number spaces, the exponential increase in probe timeout
occurs across all spaces to prevent excess load on the network.  For example,
a timeout in the Initial packet number space doubles the length of the timeout
in the Handshake packet number space.

The life of a connection that is experiencing consecutive PTOs is limited by
the endpoint's idle timeout.

The probe timer MUST NOT be set if the time threshold ({{time-threshold}}) loss
detection timer is set.  The time threshold loss detection timer is expected
to both expire earlier than the PTO and be less likely to spuriously retransmit
data.

### Handshakes and New Paths {#pto-handshake}

Resumed connections over the same network MAY use the previous connection's
final smoothed RTT value as the resumed connection's initial RTT.  When no
previous RTT is available, the initial RTT SHOULD be set to 333ms, resulting in
a 1 second initial timeout, as recommended in {{?RFC6298}}.

A connection MAY use the delay between sending a PATH_CHALLENGE and receiving a
PATH_RESPONSE to set the initial RTT (see kInitialRtt in
{{constants-of-interest}}) for a new path, but the delay SHOULD NOT be
considered an RTT sample.

Initial packets and Handshake packets could be never acknowledged, but they are
removed from bytes in flight when the Initial and Handshake keys are discarded,
as described below in {{discarding-packets}}. When Initial or Handshake keys are
discarded, the PTO and loss detection timers MUST be reset, because discarding
keys indicates forward progress and the loss detection timer might have been set
for a now discarded packet number space.

#### Before Address Validation

Until the server has validated the client's address on the path, the amount of
data it can send is limited to three times the amount of data received,
as specified in Section 8.1 of {{QUIC-TRANSPORT}}. If no additional data can be
sent, the server's PTO timer MUST NOT be armed until datagrams have been
received from the client, because packets sent on PTO count against the
anti-amplification limit. Note that the server could fail to validate the
client's address even if 0-RTT is accepted.

Since the server could be blocked until more datagrams are received from the
client, it is the client's responsibility to send packets to unblock the server
until it is certain that the server has finished its address validation
(see Section 8 of {{QUIC-TRANSPORT}}).  That is, the client MUST set the
probe timer if the client has not received an acknowledgement for one of its
Handshake or 1-RTT packets, and has not received a HANDSHAKE_DONE frame.
If Handshake keys are available to the client, it MUST send a Handshake
packet, and otherwise it MUST send an Initial packet in a UDP datagram of
at least 1200 bytes.

A client could have received and acknowledged a Handshake packet, causing it to
discard state for the Initial packet number space, but not sent any
ack-eliciting Handshake packets.  In this case, the PTO timer is armed from the
time that the Initial packet number space is discarded.

### Speeding Up Handshake Completion

When a server receives an Initial packet containing duplicate CRYPTO data,
it can assume the client did not receive all of the server's CRYPTO data sent
in Initial packets, or the client's estimated RTT is too small. When a
client receives Handshake or 1-RTT packets prior to obtaining Handshake keys,
it may assume some or all of the server's Initial packets were lost.

To speed up handshake completion under these conditions, an endpoint MAY send
a packet containing unacknowledged CRYPTO data earlier than the PTO expiry,
subject to the address validation limits in Section 8.1 of {{QUIC-TRANSPORT}}.

Endpoints can also use coalesced packets to ensure that each datagram elicits at
least one acknowledgement.  For example, a client can coalesce an Initial packet
containing PING and PADDING frames with a 0-RTT data packet and a server can
coalesce an Initial packet containing a PING frame with one or more packets in
its first flight.

### Sending Probe Packets

When a PTO timer expires, a sender MUST send at least one ack-eliciting packet
in the packet number space as a probe.  An endpoint MAY send up to two
full-sized datagrams containing ack-eliciting packets, to avoid an expensive
consecutive PTO expiration due to a single lost datagram or transmit data
from multiple packet number spaces. All probe packets sent on a PTO MUST be
ack-eliciting.

In addition to sending data in the packet number space for which the timer
expired, the sender SHOULD send ack-eliciting packets from other packet
number spaces with in-flight data, coalescing packets if possible.  This is
particularly valuable when the server has both Initial and Handshake data
in-flight or the client has both Handshake and Application Data in-flight,
because the peer might only have receive keys for one of the two packet number
spaces.

If the sender wants to elicit a faster acknowledgement on PTO, it can skip a
packet number to eliminate the acknowledgment delay.

When the PTO timer expires, an ack-eliciting packet MUST be sent.  An endpoint
SHOULD include new data in this packet.  Previously sent data MAY be sent if
no new data can be sent.  Implementations MAY use alternative strategies for
determining the content of probe packets, including sending new or
retransmitted data based on the application's priorities.

It is possible the sender has no new or previously-sent data to send.
As an example, consider the following sequence of events: new application data
is sent in a STREAM frame, deemed lost, then retransmitted in a new packet,
and then the original transmission is acknowledged.  When there is no data to
send, the sender SHOULD send a PING or other ack-eliciting frame in a single
packet, re-arming the PTO timer.

Alternatively, instead of sending an ack-eliciting packet, the sender MAY mark
any packets still in flight as lost.  Doing so avoids sending an additional
packet, but increases the risk that loss is declared too aggressively, resulting
in an unnecessary rate reduction by the congestion controller.

Consecutive PTO periods increase exponentially, and as a result, connection
recovery latency increases exponentially as packets continue to be dropped in
the network.  Sending two packets on PTO expiration increases resilience to
packet drops, thus reducing the probability of consecutive PTO events.

When the PTO timer expires multiple times and new data cannot be sent,
implementations must choose between sending the same payload every time
or sending different payloads.  Sending the same payload may be simpler
and ensures the highest priority frames arrive first.  Sending different
payloads each time reduces the chances of spurious retransmission.


## Handling Retry Packets

A Retry packet causes a client to send another Initial packet, effectively
restarting the connection process.  A Retry packet indicates that the Initial
was received, but not processed.  A Retry packet cannot be treated as an
acknowledgment, because it does not indicate that a packet was processed or
specify the packet number.

Clients that receive a Retry packet reset congestion control and loss recovery
state, including resetting any pending timers.  Other connection state, in
particular cryptographic handshake messages, is retained; see Section 17.2.5 of
{{QUIC-TRANSPORT}}.

The client MAY compute an RTT estimate to the server as the time period from
when the first Initial was sent to when a Retry or a Version Negotiation packet
is received.  The client MAY use this value in place of its default for the
initial RTT estimate.

## Discarding Keys and Packet State {#discarding-packets}

When packet protection keys are discarded (see Section 4.10 of {{QUIC-TLS}}),
all packets that were sent with those keys can no longer be acknowledged because
their acknowledgements cannot be processed anymore. The sender MUST discard
all recovery state associated with those packets and MUST remove them from
the count of bytes in flight.

Endpoints stop sending and receiving Initial packets once they start exchanging
Handshake packets; see Section 17.2.2.1 of {{QUIC-TRANSPORT}}. At this point,
recovery state for all in-flight Initial packets is discarded.

When 0-RTT is rejected, recovery state for all in-flight 0-RTT packets is
discarded.

If a server accepts 0-RTT, but does not buffer 0-RTT packets that arrive
before Initial packets, early 0-RTT packets will be declared lost, but that
is expected to be infrequent.

It is expected that keys are discarded after packets encrypted with them would
be acknowledged or declared lost.  However, Initial secrets are discarded as
soon as handshake keys are proven to be available to both client and server;
see Section 4.11.1 of {{QUIC-TLS}}.

# Congestion Control {#congestion-control}

This document specifies a congestion controller for QUIC similar to
TCP NewReno ({{?RFC6582}}).

The signals QUIC provides for congestion control are generic and are designed to
support different algorithms. Endpoints can unilaterally choose a different
algorithm to use, such as Cubic ({{?RFC8312}}).

If an endpoint uses a different controller than that specified in this document,
the chosen controller MUST conform to the congestion control guidelines
specified in Section 3.1 of {{!RFC8085}}.

Similar to TCP, packets containing only ACK frames do not count towards bytes
in flight and are not congestion controlled.  Unlike TCP, QUIC can detect the
loss of these packets and MAY use that information to adjust the congestion
controller or the rate of ACK-only packets being sent, but this document does
not describe a mechanism for doing so.

The algorithm in this document specifies and uses the controller's congestion
window in bytes.

An endpoint MUST NOT send a packet if it would cause bytes_in_flight (see
{{vars-of-interest}}) to be larger than the congestion window, unless the packet
is sent on a PTO timer expiration; see {{pto}}.

## Explicit Congestion Notification {#congestion-ecn}

If a path has been verified to support ECN ({{?RFC3168}}, {{?RFC8311}}), QUIC
treats a Congestion Experienced (CE) codepoint in the IP header as a signal of
congestion. This document specifies an endpoint's response when its peer
receives packets with the ECN-CE codepoint.

## Initial and Minimum Congestion Window {#initial-cwnd}

QUIC begins every connection in slow start with the congestion window set to
an initial value.  Endpoints SHOULD use an initial congestion window of 10 times
the maximum datagram size (max_datagram_size), limited to the larger of 14720 or
twice the maximum datagram size. This follows the analysis and recommendations
in {{?RFC6928}}, increasing the byte limit to account for the smaller 8 byte
overhead of UDP compared to the 20 byte overhead for TCP.

Prior to validating the client's address, the server can be further limited by
the anti-amplification limit as specified in Section 8.1 of {{QUIC-TRANSPORT}}.
Though the anti-amplification limit can prevent the congestion window from
being fully utilized and therefore slow down the increase in congestion window,
it does not directly affect the congestion window.

The minimum congestion window is the smallest value the congestion window can
decrease to as a response to loss, ECN-CE, or persistent congestion.
The RECOMMENDED value is 2 * max_datagram_size.

## Slow Start

While in slow start, QUIC increases the congestion window by the
number of bytes acknowledged when each acknowledgment is processed, resulting
in exponential growth of the congestion window.

QUIC exits slow start upon loss or upon increase in the ECN-CE counter.
When slow start is exited, the congestion window halves and the slow start
threshold is set to the new congestion window.  QUIC re-enters slow start
any time the congestion window is less than the slow start threshold,
which only occurs after persistent congestion is declared.

## Congestion Avoidance

Slow start exits to congestion avoidance.  Congestion avoidance uses an
Additive Increase Multiplicative Decrease (AIMD) approach that increases
the congestion window by one maximum packet size per congestion window
acknowledged.  When a loss or ECN-CE marking is detected, NewReno halves
the congestion window, sets the slow start threshold to the new
congestion window, and then enters the recovery period.

## Recovery Period

A recovery period is entered when loss or ECN-CE marking of a packet is
detected in congestion avoidance after the congestion window and slow start
threshold have been decreased.  A recovery period ends when a packet sent
during the recovery period is acknowledged.  This is slightly different from
TCP's definition of recovery, which ends when the lost packet that started
recovery is acknowledged.

The recovery period aims to limit congestion window reduction to once per round
trip. Therefore during recovery, the congestion window remains unchanged
irrespective of new losses or increases in the ECN-CE counter.

When entering recovery, a single packet MAY be sent even if bytes in flight
now exceeds the recently reduced congestion window.  This speeds up loss
recovery if the data in the lost packet is retransmitted and is similar to TCP
as described in Section 5 of {{?RFC6675}}.  If further packets are lost while
the sender is in recovery, sending any packets in response MUST obey the
congestion window limit.

## Ignoring Loss of Undecryptable Packets

During the handshake, some packet protection keys might not be available when
a packet arrives and the receiver can choose to drop the packet. In particular,
Handshake and 0-RTT packets cannot be processed until the Initial packets
arrive and 1-RTT packets cannot be processed until the handshake completes.
Endpoints MAY ignore the loss of Handshake, 0-RTT, and 1-RTT packets that might
have arrived before the peer had packet protection keys to process those
packets. Endpoints MUST NOT ignore the loss of packets that were sent after
the earliest acknowledged packet in a given packet number space.

## Probe Timeout

Probe packets MUST NOT be blocked by the congestion controller.  A sender MUST
however count these packets as being additionally in flight, since these packets
add network load without establishing packet loss.  Note that sending probe
packets might cause the sender's bytes in flight to exceed the congestion window
until an acknowledgement is received that establishes loss or delivery of
packets.

## Persistent Congestion {#persistent-congestion}

When an ACK frame is received that establishes loss of all in-flight packets
sent over a long enough period of time, the network is considered to be
experiencing persistent congestion.  Commonly, this can be established by
consecutive PTOs, but since the PTO timer is reset when a new ack-eliciting
packet is sent, an explicit duration must be used to account for those cases
where PTOs do not occur or are substantially delayed. The rationale for this
threshold is to enable a sender to use initial PTOs for aggressive probing, as
TCP does with Tail Loss Probe (TLP; see {{RACK}}), before establishing
persistent congestion, as TCP does with a Retransmission Timeout (RTO; see
{{?RFC5681}}). The RECOMMENDED value for kPersistentCongestionThreshold is 3,
which is approximately equivalent to two TLPs before an RTO in TCP.

The persistent congestion period SHOULD NOT start until there is at
least one RTT sample.  Prior to an RTT sample, the duration cannot be
correctly calculated.  Waiting for one RTT sample also avoids spuriously
declaring persistent congestion when the initial RTT is larger than the
actual RTT.

This duration is computed as follows:

~~~
(smoothed_rtt + max(4*rttvar, kGranularity) + max_ack_delay) *
    kPersistentCongestionThreshold
~~~

Unlike the PTO computation in {{pto}}, persistent congestion includes the
max_ack_delay irrespective of the packet number spaces in which losses are
established.

The following example illustrates how persistent congestion can be
established. Assume:

~~~
smoothed_rtt + max(4*rttvar, kGranularity) + max_ack_delay = 2
kPersistentCongestionThreshold = 3
~~~

Consider the following sequence of events:

| Time   |          Action            |
|:-------|:---------------------------|
| t=0    | Send packet #1 (app data)  |
| t=1    | Send packet #2 (app data)  |
| t=1.2  | Recv acknowledgement of #1 |
| t=2    | Send packet #3 (app data)  |
| t=3    | Send packet #4 (app data)  |
| t=4    | Send packet #5 (app data)  |
| t=5    | Send packet #6 (app data)  |
| t=6    | Send packet #7 (app data)  |
| t=8    | Send packet #8 (PTO 1)     |
| t=12   | Send packet #9 (PTO 2)     |
| t=12.2 | Recv acknowledgement of #9 |

Packets 2 through 8 are declared lost when the acknowledgement for packet 9 is
received at t = 12.2.

The congestion period is calculated as the time between the oldest and newest
lost packets: 8 - 1 = 7.  The duration for establishing persistent congestion
is: 2 * 3 = 6.  Because the threshold was reached and because none of the
packets between the oldest and the newest lost packets were acknowledged, the
network is considered to have experienced persistent congestion.

While this example shows the occurrence of PTOs, they are not required for
persistent congestion to be established.

When persistent congestion is established, the sender's congestion window MUST
be reduced to the minimum congestion window (kMinimumWindow).  This response of
collapsing the congestion window on persistent congestion is functionally
similar to a sender's response on a Retransmission Timeout (RTO) in TCP
({{RFC5681}}) after Tail Loss Probes (TLP; see {{RACK}}).

## Pacing {#pacing}

This document does not specify a pacer, but it is RECOMMENDED that a sender pace
sending of all in-flight packets based on input from the congestion
controller.  Sending multiple packets into the network without any delay between
them creates a packet burst that might cause short-term congestion and losses.
Implementations MUST either use pacing or another method to limit such bursts
to the initial congestion window; see {{initial-cwnd}}.

An implementation should take care to architect its congestion controller to
work well with a pacer.  For instance, a pacer might wrap the congestion
controller and control the availability of the congestion window, or a pacer
might pace out packets handed to it by the congestion controller.

Timely delivery of ACK frames is important for efficient loss recovery. Packets
containing only ACK frames SHOULD therefore not be paced, to avoid delaying
their delivery to the peer.

Endpoints can implement pacing as they choose. A perfectly paced sender spreads
packets exactly evenly over time. For a window-based congestion controller, such
as the one in this document, that rate can be computed by averaging the
congestion window over the round-trip time. Expressed as a rate in bytes:

~~~
rate = N * congestion_window / smoothed_rtt
~~~

Or, expressed as an inter-packet interval:

~~~
interval = smoothed_rtt * packet_size / congestion_window / N
~~~

Using a value for `N` that is small, but at least 1 (for example, 1.25) ensures
that variations in round-trip time don't result in under-utilization of the
congestion window.  Values of 'N' larger than 1 ultimately result in sending
packets as acknowledgments are received rather than when timers fire, provided
the congestion window is fully utilized and acknowledgments arrive at regular
intervals.

Practical considerations, such as packetization, scheduling delays, and
computational efficiency, can cause a sender to deviate from this rate over time
periods that are much shorter than a round-trip time.

One possible implementation strategy for pacing uses a leaky bucket algorithm,
where the capacity of the "bucket" is limited to the maximum burst size and the
rate the "bucket" fills is determined by the above function.

## Under-utilizing the Congestion Window

When bytes in flight is smaller than the congestion window and sending is not
pacing limited, the congestion window is under-utilized.  When this occurs,
the congestion window SHOULD NOT be increased in either slow start or
congestion avoidance. This can happen due to insufficient application data
or flow control limits.

A sender MAY use the pipeACK method described in Section 4.3 of {{?RFC7661}}
to determine if the congestion window is sufficiently utilized.

A sender that paces packets (see {{pacing}}) might delay sending packets
and not fully utilize the congestion window due to this delay. A sender
SHOULD NOT consider itself application limited if it would have fully
utilized the congestion window without pacing delay.

A sender MAY implement alternative mechanisms to update its congestion window
after periods of under-utilization, such as those proposed for TCP in
{{?RFC7661}}.


# Security Considerations

## Congestion Signals

Congestion control fundamentally involves the consumption of signals -- both
loss and ECN codepoints -- from unauthenticated entities.  On-path attackers can
spoof or alter these signals.  An attacker can cause endpoints to reduce their
sending rate by dropping packets, or alter send rate by changing ECN codepoints.

## Traffic Analysis

Packets that carry only ACK frames can be heuristically identified by observing
packet size.  Acknowledgement patterns may expose information about link
characteristics or application behavior.  To reduce leaked information,
endpoints can bundle acknowledgments with other frames, or they can use PADDING
frames at a potential cost to performance.

## Misreporting ECN Markings

A receiver can misreport ECN markings to alter the congestion response of a
sender.  Suppressing reports of ECN-CE markings could cause a sender to
increase their send rate.  This increase could result in congestion and loss.

A sender MAY attempt to detect suppression of reports by marking occasional
packets that they send with ECN-CE.  If a packet sent with ECN-CE is not
reported as having been CE marked when the packet is acknowledged, then the
sender SHOULD disable ECN for that path.

Reporting additional ECN-CE markings will cause a sender to reduce their sending
rate, which is similar in effect to advertising reduced connection flow control
limits and so no advantage is gained by doing so.

Endpoints choose the congestion controller that they use.  Though congestion
controllers generally treat reports of ECN-CE markings as equivalent to loss
({{?RFC8311}}), the exact response for each controller could be different.
Failure to correctly respond to information about ECN markings is therefore
difficult to detect.


# IANA Considerations

This document has no IANA actions.


--- back

# Loss Recovery Pseudocode

We now describe an example implementation of the loss detection mechanisms
described in {{loss-detection}}.

## Tracking Sent Packets {#tracking-sent-packets}

To correctly implement congestion control, a QUIC sender tracks every
ack-eliciting packet until the packet is acknowledged or lost.
It is expected that implementations will be able to access this information by
packet number and crypto context and store the per-packet fields
({{sent-packets-fields}}) for loss recovery and congestion control.

After a packet is declared lost, the endpoint can track it for an amount of
time comparable to the maximum expected packet reordering, such as 1 RTT.
This allows for detection of spurious retransmissions.

Sent packets are tracked for each packet number space, and ACK
processing only applies to a single space.

### Sent Packet Fields {#sent-packets-fields}

packet_number:
: The packet number of the sent packet.

ack_eliciting:
: A boolean that indicates whether a packet is ack-eliciting.
  If true, it is expected that an acknowledgement will be received,
  though the peer could delay sending the ACK frame containing it
  by up to the max_ack_delay.

in_flight:
: A boolean that indicates whether the packet counts towards bytes in
  flight.

sent_bytes:
: The number of bytes sent in the packet, not including UDP or IP
  overhead, but including QUIC framing overhead.

time_sent:
: The time the packet was sent.


## Constants of Interest {#constants-of-interest}

Constants used in loss recovery are based on a combination of RFCs, papers, and
common practice.

kPacketThreshold:
: Maximum reordering in packets before packet threshold loss detection
  considers a packet lost. The value recommended in {{packet-threshold}} is 3.

kTimeThreshold:

: Maximum reordering in time before time threshold loss detection
  considers a packet lost. Specified as an RTT multiplier. The value
  recommended in {{time-threshold}} is 9/8.

kGranularity:

: Timer granularity. This is a system-dependent value, and {{time-threshold}}
  recommends a value of 1ms.

kInitialRtt:
: The RTT used before an RTT sample is taken. The value recommended in
{{pto-handshake}} is 333ms.

kPacketNumberSpace:
: An enum to enumerate the three packet number spaces.

~~~
  enum kPacketNumberSpace {
    Initial,
    Handshake,
    ApplicationData,
  }
~~~

## Variables of interest {#ld-vars-of-interest}

Variables required to implement the congestion control mechanisms
are described in this section.

latest_rtt:
: The most recent RTT measurement made when receiving an ack for
  a previously unacked packet.

smoothed_rtt:
: The smoothed RTT of the connection, computed as described in
  {{smoothed-rtt}}.

rttvar:
: The RTT variation, computed as described in {{smoothed-rtt}}.

min_rtt:
: The minimum RTT seen in the connection, ignoring acknowledgment delay, as
  described in {{min-rtt}}.

max_ack_delay:
: The maximum amount of time by which the receiver intends to delay
  acknowledgments for packets in the Application Data packet number space. The
  actual ack_delay in a received ACK frame may be larger due to late timers,
  reordering, or lost ACK frames.

loss_detection_timer:
: Multi-modal timer used for loss detection.

pto_count:
: The number of times a PTO has been sent without receiving an ack.

time_of_last_ack_eliciting_packet\[kPacketNumberSpace]:
: The time the most recent ack-eliciting packet was sent.

largest_acked_packet\[kPacketNumberSpace]:
: The largest packet number acknowledged in the packet number space so far.

loss_time\[kPacketNumberSpace]:
: The time at which the next packet in that packet number space will be
  considered lost based on exceeding the reordering window in time.

sent_packets\[kPacketNumberSpace]:
: An association of packet numbers in a packet number space to information
  about them.  Described in detail above in {{tracking-sent-packets}}.


## Initialization

At the beginning of the connection, initialize the loss detection variables as
follows:

~~~
   loss_detection_timer.reset()
   pto_count = 0
   latest_rtt = 0
   smoothed_rtt = kInitialRtt
   rttvar = kInitialRtt / 2
   min_rtt = 0
   max_ack_delay = 0
   for pn_space in [ Initial, Handshake, ApplicationData ]:
     largest_acked_packet[pn_space] = infinite
     time_of_last_ack_eliciting_packet[pn_space] = 0
     loss_time[pn_space] = 0
~~~


## On Sending a Packet

After a packet is sent, information about the packet is stored.  The parameters
to OnPacketSent are described in detail above in {{sent-packets-fields}}.

Pseudocode for OnPacketSent follows:

~~~
 OnPacketSent(packet_number, pn_space, ack_eliciting,
              in_flight, sent_bytes):
   sent_packets[pn_space][packet_number].packet_number =
                                            packet_number
   sent_packets[pn_space][packet_number].time_sent = now()
   sent_packets[pn_space][packet_number].ack_eliciting =
                                            ack_eliciting
   sent_packets[pn_space][packet_number].in_flight = in_flight
   if (in_flight):
     if (ack_eliciting):
       time_of_last_ack_eliciting_packet[pn_space] = now()
     OnPacketSentCC(sent_bytes)
     sent_packets[pn_space][packet_number].sent_bytes =
       sent_bytes
     SetLossDetectionTimer()
~~~

## On Receiving a Datagram

When a server is blocked by anti-amplification limits, receiving
a datagram unblocks it, even if none of the packets in the
datagram are successfully processed. In such a case, the PTO
timer will need to be re-armed.

Pseudocode for OnDatagramReceived follows:

~~~
OnDatagramReceived(datagram):
  // If this datagram unblocks the server, arm the
  // PTO timer to avoid deadlock.
  if (server was at anti-amplification limit):
    SetLossDetectionTimer()
~~~

## On Receiving an Acknowledgment

When an ACK frame is received, it may newly acknowledge any number of packets.

Pseudocode for OnAckReceived and UpdateRtt follow:

~~~
IncludesAckEliciting(packets):
  for packet in packets:
    if (packet.ack_eliciting):
      return true
  return false

OnAckReceived(ack, pn_space):
  if (largest_acked_packet[pn_space] == infinite):
    largest_acked_packet[pn_space] = ack.largest_acked
  else:
    largest_acked_packet[pn_space] =
        max(largest_acked_packet[pn_space], ack.largest_acked)

  // DetectAndRemoveAckedPackets finds packets that are newly
  // acknowledged and removes them from sent_packets.
  newly_acked_packets =
      DetectAndRemoveAckedPackets(ack, pn_space)
  // Nothing to do if there are no newly acked packets.
  if (newly_acked_packets.empty()):
    return

  // If the largest acknowledged is newly acked and
  // at least one ack-eliciting was newly acked, update the RTT.
  if (newly_acked_packets.largest().packet_number ==
          ack.largest_acked &&
      IncludesAckEliciting(newly_acked_packets)):
    latest_rtt =
      now() - newly_acked_packets.largest().time_sent
    ack_delay = 0
    if (pn_space == ApplicationData):
      ack_delay = ack.ack_delay
    UpdateRtt(ack_delay)

  // Process ECN information if present.
  if (ACK frame contains ECN information):
      ProcessECN(ack, pn_space)

  lost_packets = DetectAndRemoveLostPackets(pn_space)
  if (!lost_packets.empty()):
    OnPacketsLost(lost_packets)
  OnPacketsAcked(newly_acked_packets)

  // Reset pto_count unless the client is unsure if
  // the server has validated the client's address.
  if (PeerCompletedAddressValidation()):
    pto_count = 0
  SetLossDetectionTimer()


UpdateRtt(ack_delay):
  if (is first RTT sample):
    min_rtt = latest_rtt
    smoothed_rtt = latest_rtt
    rttvar = latest_rtt / 2
    return

  // min_rtt ignores acknowledgment delay.
  min_rtt = min(min_rtt, latest_rtt)
  // Limit ack_delay by max_ack_delay
  ack_delay = min(ack_delay, max_ack_delay)
  // Adjust for acknowledgment delay if plausible.
  adjusted_rtt = latest_rtt
  if (latest_rtt > min_rtt + ack_delay):
    adjusted_rtt = latest_rtt - ack_delay

  rttvar = 3/4 * rttvar + 1/4 * abs(smoothed_rtt - adjusted_rtt)
  smoothed_rtt = 7/8 * smoothed_rtt + 1/8 * adjusted_rtt
~~~

## Setting the Loss Detection Timer

QUIC loss detection uses a single timer for all timeout loss detection.  The
duration of the timer is based on the timer's mode, which is set in the packet
and timer events further below.  The function SetLossDetectionTimer defined
below shows how the single timer is set.

This algorithm may result in the timer being set in the past, particularly if
timers wake up late. Timers set in the past fire immediately.

Pseudocode for SetLossDetectionTimer follows:

~~~
GetLossTimeAndSpace():
  time = loss_time[Initial]
  space = Initial
  for pn_space in [ Handshake, ApplicationData ]:
    if (time == 0 || loss_time[pn_space] < time):
      time = loss_time[pn_space];
      space = pn_space
  return time, space

GetPtoTimeAndSpace():
  duration = (smoothed_rtt + max(4 * rttvar, kGranularity))
      * (2 ^ pto_count)
  // Arm PTO from now when there are no inflight packets.
  if (no in-flight packets):
    assert(!PeerCompletedAddressValidation())
    if (has handshake keys):
      return (now() + duration), Handshake
    else:
      return (now() + duration), Initial
  pto_timeout = infinite
  pto_space = Initial
  for space in [ Initial, Handshake, ApplicationData ]:
    if (no in-flight packets in space):
        continue;
    if (space == ApplicationData):
      // Skip Application Data until handshake complete.
      if (handshake is not complete):
        return pto_timeout, pto_space
      // Include max_ack_delay and backoff for Application Data.
      duration += max_ack_delay * (2 ^ pto_count)

    t = time_of_last_ack_eliciting_packet[space] + duration
    if (t < pto_timeout):
      pto_timeout = t
      pto_space = space
  return pto_timeout, pto_space

PeerCompletedAddressValidation():
  // Assume clients validate the server's address implicitly.
  if (endpoint is server):
    return true
  // Servers complete address validation when a
  // protected packet is received.
  return has received Handshake ACK ||
       has received 1-RTT ACK ||
       has received HANDSHAKE_DONE

SetLossDetectionTimer():
  earliest_loss_time, _ = GetLossTimeAndSpace()
  if (earliest_loss_time != 0):
    // Time threshold loss detection.
    loss_detection_timer.update(earliest_loss_time)
    return

  if (server is at anti-amplification limit):
    // The server's timer is not set if nothing can be sent.
    loss_detection_timer.cancel()
    return

  if (no ack-eliciting packets in flight &&
      PeerCompletedAddressValidation()):
    // There is nothing to detect lost, so no timer is set.
    // However, the client needs to arm the timer if the
    // server might be blocked by the anti-amplification limit.
    loss_detection_timer.cancel()
    return

  // Determine which PN space to arm PTO for.
  timeout, _ = GetPtoTimeAndSpace()
  loss_detection_timer.update(timeout)
~~~


## On Timeout

When the loss detection timer expires, the timer's mode determines the action
to be performed.

Pseudocode for OnLossDetectionTimeout follows:

~~~
OnLossDetectionTimeout():
  earliest_loss_time, pn_space = GetLossTimeAndSpace()
  if (earliest_loss_time != 0):
    // Time threshold loss Detection
    lost_packets = DetectAndRemoveLostPackets(pn_space)
    assert(!lost_packets.empty())
    OnPacketsLost(lost_packets)
    SetLossDetectionTimer()
    return

  if (bytes_in_flight > 0):
    // PTO. Send new data if available, else retransmit old data.
    // If neither is available, send a single PING frame.
    _, pn_space = GetPtoTimeAndSpace()
    SendOneOrTwoAckElicitingPackets(pn_space)
  else:
    assert(!PeerCompletedAddressValidation())
    // Client sends an anti-deadlock packet: Initial is padded
    // to earn more anti-amplification credit,
    // a Handshake packet proves address ownership.
    if (has Handshake keys):
      SendOneAckElicitingHandshakePacket()
    else:
      SendOneAckElicitingPaddedInitialPacket()

  pto_count++
  SetLossDetectionTimer()
~~~


## Detecting Lost Packets

DetectAndRemoveLostPackets is called every time an ACK is received or the time
threshold loss detection timer expires. This function operates on the
sent_packets for that packet number space and returns a list of packets newly
detected as lost.

Pseudocode for DetectAndRemoveLostPackets follows:

~~~
DetectAndRemoveLostPackets(pn_space):
  assert(largest_acked_packet[pn_space] != infinite)
  loss_time[pn_space] = 0
  lost_packets = {}
  loss_delay = kTimeThreshold * max(latest_rtt, smoothed_rtt)

  // Minimum time of kGranularity before packets are deemed lost.
  loss_delay = max(loss_delay, kGranularity)

  // Packets sent before this time are deemed lost.
  lost_send_time = now() - loss_delay

  foreach unacked in sent_packets[pn_space]:
    if (unacked.packet_number > largest_acked_packet[pn_space]):
      continue

    // Mark packet as lost, or set time when it should be marked.
    if (unacked.time_sent <= lost_send_time ||
        largest_acked_packet[pn_space] >=
          unacked.packet_number + kPacketThreshold):
      sent_packets[pn_space].remove(unacked.packet_number)
      if (unacked.in_flight):
        lost_packets.insert(unacked)
    else:
      if (loss_time[pn_space] == 0):
        loss_time[pn_space] = unacked.time_sent + loss_delay
      else:
        loss_time[pn_space] = min(loss_time[pn_space],
                                  unacked.time_sent + loss_delay)
  return lost_packets
~~~


# Congestion Control Pseudocode

We now describe an example implementation of the congestion controller described
in {{congestion-control}}.

## Constants of interest {#cc-consts-of-interest}

Constants used in congestion control are based on a combination of RFCs, papers,
and common practice.

kInitialWindow:
: Default limit on the initial bytes in flight as described in {{initial-cwnd}}.

kMinimumWindow:
: Minimum congestion window in bytes as described in {{initial-cwnd}}.

kLossReductionFactor:
: Reduction in congestion window when a new loss event is detected.
  {{congestion-control}} recommends a value is 0.5.

kPersistentCongestionThreshold:
: Period of time for persistent congestion to be established, specified as a PTO
  multiplier. {{persistent-congestion}} recommends a value of 3.


## Variables of interest {#vars-of-interest}

Variables required to implement the congestion control mechanisms
are described in this section.

max_datagram_size:
: The sender's current maximum payload size. Does not include UDP or IP
  overhead.  The max datagram size is used for congestion window
  computations. An endpoint sets the value of this variable based on its
  PMTU (see Section 14.1 of {{QUIC-TRANSPORT}}), with a minimum value of
  1200 bytes.

ecn_ce_counters\[kPacketNumberSpace]:
: The highest value reported for the ECN-CE counter in the packet number space
  by the peer in an ACK frame. This value is used to detect increases in the
  reported ECN-CE counter.

bytes_in_flight:
: The sum of the size in bytes of all sent packets that contain at least one
  ack-eliciting or PADDING frame, and have not been acknowledged or declared
  lost. The size does not include IP or UDP overhead, but does include the QUIC
  header and AEAD overhead.  Packets only containing ACK frames do not count
  towards bytes_in_flight to ensure congestion control does not impede
  congestion feedback.

congestion_window:
: Maximum number of bytes-in-flight that may be sent.

congestion_recovery_start_time:
: The time when QUIC first detects congestion due to loss or ECN, causing
  it to enter congestion recovery. When a packet sent after this time is
  acknowledged, QUIC exits congestion recovery.

ssthresh:
: Slow start threshold in bytes.  When the congestion window is below ssthresh,
  the mode is slow start and the window grows by the number of bytes
  acknowledged.


## Initialization

At the beginning of the connection, initialize the congestion control
variables as follows:

~~~
   congestion_window = kInitialWindow
   bytes_in_flight = 0
   congestion_recovery_start_time = 0
   ssthresh = infinite
   for pn_space in [ Initial, Handshake, ApplicationData ]:
     ecn_ce_counters[pn_space] = 0
~~~


## On Packet Sent

Whenever a packet is sent, and it contains non-ACK frames, the packet
increases bytes_in_flight.

~~~
   OnPacketSentCC(bytes_sent):
     bytes_in_flight += bytes_sent
~~~


## On Packet Acknowledgement

Invoked from loss detection's OnAckReceived and is supplied with the
newly acked_packets from sent_packets.

~~~
  InCongestionRecovery(sent_time):
    return sent_time <= congestion_recovery_start_time

  OnPacketsAcked(acked_packets):
    for acked_packet in acked_packets:
      OnPacketAcked(acked_packet)

  OnPacketAcked(acked_packet):
    // Remove from bytes_in_flight.
    bytes_in_flight -= acked_packet.sent_bytes

    // Do not increase congestion_window if application
    // limited or flow control limited.
    if (IsAppOrFlowControlLimited())
      return

    // Do not increase congestion window in recovery period.
    if (InCongestionRecovery(acked_packet.time_sent)):
      return

    if (congestion_window < ssthresh):
      // Slow start.
      congestion_window += acked_packet.sent_bytes
    else:
      // Congestion avoidance.
      congestion_window +=
        max_datagram_size * acked_packet.sent_bytes
        / congestion_window
~~~


## On New Congestion Event

Invoked from ProcessECN and OnPacketsLost when a new congestion event is
detected. May start a new recovery period and reduces the congestion
window.

~~~
   CongestionEvent(sent_time):
     // Start a new congestion event if packet was sent after the
     // start of the previous congestion recovery period.
     if (!InCongestionRecovery(sent_time)):
       congestion_recovery_start_time = now()
       congestion_window *= kLossReductionFactor
       congestion_window = max(congestion_window, kMinimumWindow)
       ssthresh = congestion_window
       // A packet can be sent to speed up loss recovery.
       MaybeSendOnePacket()
~~~


## Process ECN Information

Invoked when an ACK frame with an ECN section is received from the peer.

~~~
   ProcessECN(ack, pn_space):
     // If the ECN-CE counter reported by the peer has increased,
     // this could be a new congestion event.
     if (ack.ce_counter > ecn_ce_counters[pn_space]):
       ecn_ce_counters[pn_space] = ack.ce_counter
       CongestionEvent(sent_packets[ack.largest_acked].time_sent)
~~~


## On Packets Lost

Invoked when DetectAndRemoveLostPackets deems packets lost.

~~~
   InPersistentCongestion(largest_lost):
     // Persistent congestion cannot be declared on the
     // first RTT sample.
     if (is first RTT sample):
       return false
     pto = smoothed_rtt + max(4 * rttvar, kGranularity) +
       max_ack_delay
     congestion_period = pto * kPersistentCongestionThreshold
     // Determine if all packets in the time period before the
     // largest newly lost packet, including the edges and
     // across all packet number spaces, are marked lost.
     return AreAllPacketsLost(largest_lost, congestion_period)

   OnPacketsLost(lost_packets):
     // Remove lost packets from bytes_in_flight.
     for lost_packet in lost_packets:
       bytes_in_flight -= lost_packet.sent_bytes
     CongestionEvent(lost_packets.largest().time_sent)

     // Collapse congestion window if persistent congestion
     if (InPersistentCongestion(lost_packets.largest())):
       congestion_window = kMinimumWindow
~~~

## Upon dropping Initial or Handshake keys

When Initial or Handshake keys are discarded, packets from the space
are discarded and loss detection state is updated.

Pseudocode for OnPacketNumberSpaceDiscarded follows:

~~~
OnPacketNumberSpaceDiscarded(pn_space):
  assert(pn_space != ApplicationData)
  // Remove any unacknowledged packets from flight.
  foreach packet in sent_packets[pn_space]:
    if packet.in_flight
      bytes_in_flight -= size
  sent_packets[pn_space].clear()
  // Reset the loss detection and PTO timer
  time_of_last_ack_eliciting_packet[pn_space] = 0
  loss_time[pn_space] = 0
  pto_count = 0
  SetLossDetectionTimer()
~~~

# Change Log

> **RFC Editor's Note:**  Please remove this section prior to
> publication of a final version of this document.

Issue and pull request numbers are listed with a leading octothorp.

## Since draft-ietf-quic-recovery-28

- Refactored pseudocode to correct PTO calculation (#3564, #3674, #3681)

## Since draft-ietf-quic-recovery-27

- Added recommendations for speeding up handshake under some loss conditions
  (#3078, #3080)
- PTO count is reset when handshake progress is made (#3272, #3415)
- PTO count is not reset by a client when the server might be awaiting
  address validation (#3546, #3551)
- Recommend repairing losses immediately after entering the recovery period
  (#3335, #3443)
- Clarified what loss conditions can be ignored during the handshake (#3456,
  #3450)
- Allow, but don't recommend, using RTT from previous connection to seed RTT
  (#3464, #3496)
- Recommend use of adaptive loss detection thresholds (#3571, #3572)

## Since draft-ietf-quic-recovery-26

No changes.

## Since draft-ietf-quic-recovery-25

No significant changes.

## Since draft-ietf-quic-recovery-24

- Require congestion control of some sort (#3247, #3244, #3248)
- Set a minimum reordering threshold (#3256, #3240)
- PTO is specific to a packet number space (#3067, #3074, #3066)

## Since draft-ietf-quic-recovery-23

- Define under-utilizing the congestion window (#2630, #2686, #2675)
- PTO MUST send data if possible (#3056, #3057)
- Connection Close is not ack-eliciting (#3097, #3098)
- MUST limit bursts to the initial congestion window (#3160)
- Define the current max_datagram_size for congestion control
  (#3041, #3167)

## Since draft-ietf-quic-recovery-22

- PTO should always send an ack-eliciting packet (#2895)
- Unify the Handshake Timer with the PTO timer (#2648, #2658, #2886)
- Move ACK generation text to transport draft (#1860, #2916)

## Since draft-ietf-quic-recovery-21

- No changes

## Since draft-ietf-quic-recovery-20

- Path validation can be used as initial RTT value (#2644, #2687)
- max_ack_delay transport parameter defaults to 0 (#2638, #2646)
- ACK delay only measures intentional delays induced by the implementation
  (#2596, #2786)

## Since draft-ietf-quic-recovery-19

- Change kPersistentThreshold from an exponent to a multiplier (#2557)
- Send a PING if the PTO timer fires and there's nothing to send (#2624)
- Set loss delay to at least kGranularity (#2617)
- Merge application limited and sending after idle sections. Always limit
  burst size instead of requiring resetting CWND to initial CWND after
  idle (#2605)
- Rewrite RTT estimation, allow RTT samples where a newly acked packet is
  ack-eliciting but the largest_acked is not (#2592)
- Don't arm the handshake timer if there is no handshake data (#2590)
- Clarify that the time threshold loss alarm takes precedence over the
  crypto handshake timer (#2590, #2620)
- Change initial RTT to 500ms to align with RFC6298 (#2184)

## Since draft-ietf-quic-recovery-18

- Change IW byte limit to 14720 from 14600 (#2494)
- Update PTO calculation to match RFC6298 (#2480, #2489, #2490)
- Improve loss detection's description of multiple packet number spaces and
  pseudocode (#2485, #2451, #2417)
- Declare persistent congestion even if non-probe packets are sent and don't
  make persistent congestion more aggressive than RTO verified was (#2365,
  #2244)
- Move pseudocode to the appendices (#2408)
- What to send on multiple PTOs (#2380)

## Since draft-ietf-quic-recovery-17

- After Probe Timeout discard in-flight packets or send another (#2212, #1965)
- Endpoints discard initial keys as soon as handshake keys are available (#1951,
  #2045)
- 0-RTT state is discarded when 0-RTT is rejected (#2300)
- Loss detection timer is cancelled when ack-eliciting frames are in flight
  (#2117, #2093)
- Packets are declared lost if they are in flight (#2104)
- After becoming idle, either pace packets or reset the congestion controller
  (#2138, 2187)
- Process ECN counts before marking packets lost (#2142)
- Mark packets lost before resetting crypto_count and pto_count (#2208, #2209)
- Congestion and loss recovery state are discarded when keys are discarded
  (#2327)

## Since draft-ietf-quic-recovery-16

- Unify TLP and RTO into a single PTO; eliminate min RTO, min TLP and min crypto
  timeouts; eliminate timeout validation (#2114, #2166, #2168, #1017)
- Redefine how congestion avoidance in terms of when the period starts (#1928,
  #1930)
- Document what needs to be tracked for packets that are in flight (#765, #1724,
  #1939)
- Integrate both time and packet thresholds into loss detection (#1969, #1212,
  #934, #1974)
- Reduce congestion window after idle, unless pacing is used (#2007, #2023)
- Disable RTT calculation for packets that don't elicit acknowledgment (#2060,
  #2078)
- Limit ack_delay by max_ack_delay (#2060, #2099)
- Initial keys are discarded once Handshake keys are available (#1951, #2045)
- Reorder ECN and loss detection in pseudocode (#2142)
- Only cancel loss detection timer if ack-eliciting packets are in flight
  (#2093, #2117)

## Since draft-ietf-quic-recovery-14

- Used max_ack_delay from transport params (#1796, #1782)
- Merge ACK and ACK_ECN (#1783)

## Since draft-ietf-quic-recovery-13

- Corrected the lack of ssthresh reduction in CongestionEvent pseudocode (#1598)
- Considerations for ECN spoofing (#1426, #1626)
- Clarifications for PADDING and congestion control (#837, #838, #1517, #1531,
  #1540)
- Reduce early retransmission timer to RTT/8 (#945, #1581)
- Packets are declared lost after an RTO is verified (#935, #1582)

## Since draft-ietf-quic-recovery-12

- Changes to manage separate packet number spaces and encryption levels (#1190,
  #1242, #1413, #1450)
- Added ECN feedback mechanisms and handling; new ACK_ECN frame (#804, #805,
  #1372)

## Since draft-ietf-quic-recovery-11

No significant changes.

## Since draft-ietf-quic-recovery-10

- Improved text on ack generation (#1139, #1159)
- Make references to TCP recovery mechanisms informational (#1195)
- Define time_of_last_sent_handshake_packet (#1171)
- Added signal from TLS the data it includes needs to be sent in a Retry packet
  (#1061, #1199)
- Minimum RTT (min_rtt) is initialized with an infinite value (#1169)

## Since draft-ietf-quic-recovery-09

No significant changes.

## Since draft-ietf-quic-recovery-08

- Clarified pacing and RTO (#967, #977)

## Since draft-ietf-quic-recovery-07

- Include ACK delay in RTO(and TLP) computations (#981)
- ACK delay in SRTT computation (#961)
- Default RTT and Slow Start (#590)
- Many editorial fixes.

## Since draft-ietf-quic-recovery-06

No significant changes.

## Since draft-ietf-quic-recovery-05

- Add more congestion control text (#776)

## Since draft-ietf-quic-recovery-04

No significant changes.

## Since draft-ietf-quic-recovery-03

No significant changes.

## Since draft-ietf-quic-recovery-02

- Integrate F-RTO (#544, #409)
- Add congestion control (#545, #395)
- Require connection abort if a skipped packet was acknowledged (#415)
- Simplify RTO calculations (#142, #417)


## Since draft-ietf-quic-recovery-01

- Overview added to loss detection
- Changes initial default RTT to 100ms
- Added time-based loss detection and fixes early retransmit
- Clarified loss recovery for handshake packets
- Fixed references and made TCP references informative


## Since draft-ietf-quic-recovery-00

- Improved description of constants and ACK behavior


## Since draft-iyengar-quic-loss-recovery-01

- Adopted as base for draft-ietf-quic-recovery
- Updated authors/editors list
- Added table of contents


# Contributors

The IETF QUIC Working Group received an enormous amount of support from many
people. The following people provided substantive contributions to this
document:
Alessandro Ghedini,
Benjamin Saunders,
Gorry Fairhurst, <contact
 asciiFullname="Kazuho Oku" fullname="奥 一穂"/>,
Lars Eggert,
Magnus Westerlund,
Marten Seemann,
Martin Duke,
Martin Thomson,
Nick Banks,
Praveen Balasubramaniam.

# Acknowledgments
{:numbered="false"}

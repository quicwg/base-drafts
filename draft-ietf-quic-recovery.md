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
    org: Google
    email: jri@google.com
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
        org: Google
        role: editor
      -
        ins: M. Thomson
        name: Martin Thomson
        org: Mozilla
        role: editor


informative:

  TLP:
    title: "Tail Loss Probe (TLP): An Algorithm for Fast Recovery of Tail Losses"
    date: "February 2013"
    seriesinfo:
      Internet-Draft: draft-dukkipati-tcpm-tcp-loss-probe-01
    author:
      -
        ins: N. Dukkipati
        name: Nandita Dukkipati
        org: Google
      -
        ins: N. Cardwell
        name: Neal Cardwell
        org: Google
      -
        ins: Y. Cheng
        name: Yuchung Cheng
        org: Google
      -
        ins: M. Mathis
        name: Matt Mathis
        org: Google


--- abstract

This document describes loss detection and congestion control mechanisms for
QUIC.

--- note_Note_to_Readers

Discussion of this draft takes place on the QUIC working group mailing list
(quic@ietf.org), which is archived at
<https://mailarchive.ietf.org/arch/search/?email_list=quic>.

Working Group information can be found at <https://github.com/quicwg>; source
code and issues list for this draft can be found at
<https://github.com/quicwg/base-drafts/labels/recovery>.

--- middle

# Introduction

QUIC is a new multiplexed and secure transport atop UDP.  QUIC builds on decades
of transport and security experience, and implements mechanisms that make it
attractive as a modern general-purpose transport.  The QUIC protocol is
described in {{QUIC-TRANSPORT}}.

QUIC implements the spirit of known TCP loss recovery mechanisms, described in
RFCs, various Internet-drafts, and also those prevalent in the Linux TCP
implementation.  This document describes QUIC congestion control and loss
recovery, and where applicable, attributes the TCP equivalent in RFCs,
Internet-drafts, academic papers, and/or TCP implementations.


## Notational Conventions

The words "MUST", "MUST NOT", "SHOULD", and "MAY" are used in this document.
It's not shouting; when they are capitalized, they have the special meaning
defined in {{!RFC2119}}.


# Design of the QUIC Transmission Machinery

All transmissions in QUIC are sent with a packet-level header, which includes a
packet sequence number (referred to below as a packet number).  These packet
numbers never repeat in the lifetime of a connection, and are monotonically
increasing, which makes duplicate detection trivial.  This fundamental design
decision obviates the need for disambiguating between transmissions and
retransmissions and eliminates significant complexity from QUIC's interpretation
of TCP loss detection mechanisms.

Every packet may contain several frames.  We outline the frames that are
important to the loss detection and congestion control machinery below.

* Retransmittable frames are frames requiring reliable delivery.  The most
  common are STREAM frames, which typically contain application data.

* Crypto handshake data is sent on stream 0, and uses the reliability
  machinery of QUIC underneath.

* ACK frames contain acknowledgment information.  QUIC uses a SACK-based
  scheme, where acks express up to 256 ranges.

## Relevant Differences Between QUIC and TCP

Readers familiar with TCP's loss detection and congestion control will find
algorithms here that parallel well-known TCP ones. Protocol differences between
QUIC and TCP however contribute to algorithmic differences. We briefly describe
these protocol differences below.

### Monotonically Increasing Packet Numbers

TCP conflates transmission sequence number at the sender with delivery sequence
number at the receiver, which results in retransmissions of the same data
carrying the same sequence number, and consequently to problems caused by
"retransmission ambiguity".  QUIC separates the two: QUIC uses a packet sequence
number (referred to as the "packet number") for transmissions, and any data that
is to be delivered to the receiving application(s) is sent in one or more
streams, with stream offsets encoded within STREAM frames inside of packets that
determine delivery order.

QUIC's packet number is strictly increasing, and directly encodes transmission
order.  A higher QUIC packet number signifies that the packet was sent later,
and a lower QUIC packet number signifies that the packet was sent earlier.  When
a packet containing frames is deemed lost, QUIC rebundles necessary frames in a
new packet with a new packet number, removing ambiguity about which packet is
acknowledged when an ACK is received.  Consequently, more accurate RTT
measurements can be made, spurious retransmissions are trivially detected, and
mechanisms such as Fast Retransmit can be applied universally, based only on
packet number.

This design point significantly simplifies loss detection mechanisms for QUIC.
Most TCP mechanisms implicitly attempt to infer transmission ordering based on
TCP sequence numbers - a non-trivial task, especially when TCP timestamps are
not available.

### No Reneging

QUIC ACKs contain information that is equivalent to TCP SACK, but QUIC does not
allow any acked packet to be reneged, greatly simplifying implementations on
both sides and reducing memory pressure on the sender.

### More ACK Ranges

QUIC supports up to 256 ACK ranges, opposed to TCP's 3 SACK ranges.  In high
loss environments, this speeds recovery.

### Explicit Correction For Delayed Acks

QUIC ACKs explicitly encode the delay incurred at the receiver between when a
packet is received and when the corresponding ACK is sent.  This allows the
receiver of the ACK to adjust for receiver delays, specifically the delayed ack
timer, when estimating the path RTT.  This mechanism also allows a receiver to
measure and report the delay from when a packet was received by the OS kernel,
which is useful in receivers which may incur delays such as context-switch
latency before a userspace QUIC receiver processes a received packet.


# Loss Detection

QUIC senders use both ack information and timeouts to detect lost packets, and
this section provides a description of these algorithms. Estimating the network
round-trip time (RTT) is critical to these algorithms and is described first.

## Computing the RTT estimate

(To be filled)


## Ack-based Detection

Ack-based loss detection implements the spirit of TCP's Fast Retransmit
{{!RFC5681}}, Early Retransmit {{!RFC5827}}, FACK, and SACK loss recovery
{{!RFC6675}}. This section provides an overview of how these algorithms are
implemented in QUIC.

(TODO: Define unacknowledged packet, ackable packet, outstanding bytes.)

### Fast Retransmit

An unacknowledged packet is marked as lost when an acknowledgment is received
for a packet that was sent a threshold number of packets (kReorderingThreshold)
after the unacknowledged packet. Receipt of the ack indicates that a later
packet was received, while kReorderingThreshold provides some tolerance for
reordering of packets in the network.

The RECOMMENDED initial value for kReorderingThreshold is 3.

We derive this default from recommendations for TCP loss recovery {{!RFC5681}}
{{!RFC6675}}. It is possible for networks to exhibit higher degrees of
reordering, causing a sender to detect spurious losses. Detecting spurious
losses leads to unnecessary retransmissions and may result in degraded
performance due to the actions of the congestion controller upon detecting
loss. Implementers MAY use algorithms developed for TCP, such as TCP-NCR
{{!RFC4653}}, to improve QUIC's reordering resilience, though care should be
taken to map TCP specifics to QUIC correctly. Similarly, using time-based loss
detection to deal with reordering, such as in PR-TCP, should be more readily
usable in QUIC. Making QUIC deal with such networks is important open research,
and implementers are encouraged to explore this space.

### Early Retransmit

Unacknowledged packets close to the tail may have fewer than
kReorderingThreshold number of ackable packets sent after them. Loss of such
packets cannot be detected via Fast Retransmit. To enable ack-based loss
detection of such packets, receipt of an acknowledgment for the last outstanding
ackable packet triggers the Early Retransmit process, as follows.

If there are unacknowledged ackable packets still pending, they ought to be
marked as lost. To compensate for the reduced reordering resilience, the sender
SHOULD set an alarm for a small period of time. If the unacknowledged ackable
packets are not acknowledged during this time, then these packets MUST be marked
as lost.

An endpoint SHOULD set the alarm such that a packet is marked as lost no earlier
than 1.25 * max(SRTT, latest_RTT) since when it was sent.

Using max(SRTT, latest_RTT) protects from the two following cases:

* the latest RTT sample is lower than the SRTT, perhaps due to reordering where
packet whose ack triggered the Early Retransit process encountered a shorter
path;

* the latest RTT sample is higher than the SRTT, perhaps due to a sustained
increase in the actual RTT, but the smoothed SRTT has not yet caught up.

The 1.25 multiplier increases reordering resilience. Implementers MAY experiment
with using other multipliers, bearing in mind that a lower multiplier reduces
reordering resilience and increases spurious retransmissions, and a higher
multipler increases loss recovery delay.

This mechanism is based on Early Retransmit for TCP {{!RFC5827}}. However,
{{!RFC5827}} does not include the alarm described above. Early Retransmit is
prone to spurious retransmissions due to its reduced reordering resilence
without the alarm. This observation led Linux TCP implementers to implement an
alarm for TCP as well, and this document incorporates this advancement.


## Timer-based Detection

Timer-based loss detection implements the spirit of TCP's Tail Loss Probe
and Retransmission Timeout mechanisms.

### Tail Loss Probe

The algorithm described in this section is an adaptation of the Tail Loss Probe
algorithm proposed for TCP {{TLP}}.

A packet sent at the tail is particularly vulnerable to slow loss detection,
since acks of subsequent packets are needed to trigger ack-based detection. To
ameliorate this weakness of tail packets, the sender schedules an alarm when the
last ackable packet before quiescence is transmitted. When this alarm fires, a
Tail Loss Probe (TLP) packet is sent to evoke an acknowledgement from the
receiver.

The alarm duration, or Probe Timeout (PTO), is set based on the following
conditions:

* If there is exactly one unacknowledged packet, PTO SHOULD be scheduled for
  max(2*SRTT, 1.5*SRTT+kDelayedAckTimeout)

* If there are more than one unacknowledged packets, PTO SHOULD be scheduled for
  max(2*SRTT, 10ms).

* If RTO is earlier, schedule a TLP alarm in its place. That is, PTO SHOULD be
  scheduled for min(RTO, PTO).

kDelayedAckTimeout is the expected delayed ACK timer.  When there is exactly one
unacknowledged packet, the alarm duration includes time for an acknowledgment to
be received, and additionally, a kDelayedAckTimeout period to compensate for the
delayed acknowledgment timer at the receiver.

The RECOMMENDED value for kDelayedAckTimeout is 25ms.

(TODO: Add negotiability of delayed ack timeout.)

A PTO value of at least 2*SRTT ensures that the ACK is overdue. Using a PTO of
exactly 1*SRTT may generate spurious probes, and 2*SRTT is simply the next
integral value of RTT.

(TODO: These values of 2 and 1.5 are a bit arbitrary. Reconsider these.)

If the Retransmission Timeout (RTO, {{rto}}) period is smaller than the computed
PTO, then a PTO is scheduled for the smaller RTO period.

To reduce latency, it is RECOMMENDED that the sender set and allow the TLP alarm
to fire twice before setting an RTO alarm. In other words, when the TLP alarm
fires the first time, a TLP packet is sent, and it is RECOMMENDED that the TLP
alarm be scheduled for a second time. When the TLP alarm fires the second time,
a second TLP packet is sent, and an RTO alarm SHOULD be scheduled {{rto}}.

A TLP packet SHOULD carry new data when possible. If new data is unavailable or
new data cannot be sent due to flow control, a TLP packet MAY retransmit
unacknowledged data to potentially reduce recovery time. Since a TLP alarm is
used to send a probe into the network prior to establishing any packet loss,
prior unacknowledged packets SHOULD NOT be marked as lost when a TLP alarm
fires.

A TLP packet MUST NOT be blocked by the sender's congestion controller. The
sender MUST however count these bytes as additional bytes in flight, since a TLP
adds network load without establishing packet loss.

A sender will commonly not know that a packet being sent is a tail packet.
Consequently, a sender may have to arm or adjust the TLP alarm on every sent
ackable packet.

### Retransmission Timeout {#rto}

A Retransmission Timeout (RTO) alarm is the final backstop for loss
detection. The algorithm used in QUIC is based on the RTO algorithm for TCP
{{!RFC5681}} and is additionally resilient to spurious RTO events {{!RFC5682}}.

When the last TLP packet is sent, an alarm is scheduled for the RTO period. When
this alarm fires, the sender sends two packets, to evoke acknowledgements from
the receiver, and restarts the RTO alarm.

Similar to TCP {{!RFC6298}}, the RTO period is set based on the following
conditions:

* When the final TLP packet is sent, the RTO period is set to max(SRTT +
  4*RTTVAR, minRTO)

* When an RTO alarm fires, the RTO period is doubled.

The sender typically has incurred a high latency penalty by the time an RTO
alarm fires, and this penalty increases exponentially in subsequent consecutive
RTO events. Sending a single packet on an RTO event therefore makes the
connection very sensitive to single packet loss. Sending two packets instead of
one significantly increases resilience to packet drop in both directions, thus
reducing the probability of consecutive RTO events.

QUIC's RTO algorithm differs from TCP in that the firing of an RTO alarm is not
considered a strong enough signal of packet loss. An RTO alarm fires only when
there's a prolonged period of network silence, which could be caused by a change
in the underlying network RTT.

When an acknowledgment is received for a packet sent on an RTO event, any
unacknowledged packets with lower packet numbers than those acknowledged MUST be
marked as lost.

A packet sent when an RTO alarm fires MAY carry new data if available or
unacknowledged data to potentially reduce recovery time. Since this packet is
sent as a probe into the network prior to establishing any packet loss, prior
unacknowledged packets SHOULD NOT be marked as lost.

A packet sent on an RTO alarm MUST NOT be blocked by the sender's congestion
controller. A sender MUST however count these bytes as additional bytes in
flight, since this packet adds network load without establishing packet loss.


### Handshake Timeout

Handshake packets, which contain STREAM frames for stream 0, are critical to
QUIC transport and crypto negotiation, so a separate alarm is used for them.

The handshake timeout SHOULD be set to twice the initial RTT.

There are no prior RTT samples within this connection. However, this may be a
resumed connection over the same network, in which case, a client SHOULD use the
previous connection's final smoothed RTT value as the resumed connection's
initial RTT.

If no previous RTT is available, or if the network changes, the initial RTT
SHOULD be set to 100ms.

When the first handshake packet is sent, the sender SHOULD set an alarm for the
handshake timeout period.

When the alarm fires, the sender MUST retransmit all unacknowledged handshake
frames. The sender SHOULD double the handshake timeout and set an alarm for this
period.

On each consecutive firing of the handshake alarm, the sender SHOULD double the
handshake timeout period.

When an acknowledgement is received for a handshake packet, the new RTT is
computed and the alarm SHOULD be set for twice the newly computed smoothed RTT.

Handshake frames may be cancelled by handshake state transitions. In particular,
all non-protected frames SHOULD no longer be transmitted once packet protection
is available.

(TODO: Work this section some more. Add text on client vs. server, and on
stateless retry.)

## Algorithm Details

### Constants of interest

Constants used in loss recovery are based on a combination of RFCs, papers,
and common practice.  Some may need to be changed or negotiated in order to
better suit a variety of environments.

kMaxTLPs (default 2):
: Maximum number of tail loss probes before an RTO fires.

kReorderingThreshold (default 3):
: Maximum reordering in packet number space before FACK style loss detection
  considers a packet lost.

kTimeReorderingFraction (default 1/8):
: Maximum reordering in time space before time based loss detection considers
  a packet lost.  In fraction of an RTT.

kMinTLPTimeout (default 10ms):
: Minimum time in the future a tail loss probe alarm may be set for.

kMinRTOTimeout (default 200ms):
:  Minimum time in the future an RTO alarm may be set for.

kDelayedAckTimeout (default 25ms):
: The length of the peer's delayed ack timer.

kDefaultInitialRtt (default 100ms):
: The default RTT used before an RTT sample is taken.

### Variables of interest

Variables required to implement the congestion control mechanisms
are described in this section.

loss_detection_alarm:
: Multi-modal alarm used for loss detection.

handshake_count:
: The number of times the handshake packets have been
  retransmitted without receiving an ack.

tlp_count:
: The number of times a tail loss probe has been sent without
  receiving an ack.

rto_count:
: The number of times an rto has been sent without receiving an ack.

largest_sent_before_rto:
: The last packet number sent prior to the first retransmission
  timeout.

time_of_last_sent_packet:
: The time the most recent packet was sent.

largest_sent_packet:
: The packet number of the most recently sent packet.

largest_acked_packet:
: The largest packet number acknowledged in an ack frame.

latest_rtt:
: The most recent RTT measurement made when receiving an ack for
  a previously unacked packet.

smoothed_rtt:
: The smoothed RTT of the connection, computed as described in
  {{?RFC6298}}

rttvar:
: The RTT variance, computed as described in {{?RFC6298}}

reordering_threshold:
: The largest delta between the largest acked
  retransmittable packet and a packet containing retransmittable frames before
  it's declared lost.

time_reordering_fraction:
: The reordering window as a fraction of max(smoothed_rtt, latest_rtt).

loss_time:
: The time at which the next packet will be considered lost based on early
transmit or exceeding the reordering window in time.

sent_packets:
: An association of packet numbers to information about them, including a number
  field indicating the packet number, a time field indicating the time a packet
  was sent, and a bytes field indicating the packet's size.  sent_packets is
  ordered by packet number, and packets remain in sent_packets until
  acknowledged or lost.

### Initialization

At the beginning of the connection, initialize the loss detection variables as
follows:

~~~
   loss_detection_alarm.reset()
   handshake_count = 0
   tlp_count = 0
   rto_count = 0
   if (UsingTimeLossDetection())
     reordering_threshold = infinite
     time_reordering_fraction = kTimeReorderingFraction
   else:
     reordering_threshold = kReorderingThreshold
     time_reordering_fraction = infinite
   loss_time = 0
   smoothed_rtt = 0
   rttvar = 0
   largest_sent_before_rto = 0
   time_of_last_sent_packet = 0
   largest_sent_packet = 0
~~~

### On Sending a Packet

After any packet is sent, be it a new transmission or a rebundled transmission,
the following OnPacketSent function is called.  The parameters to OnPacketSent
are as follows:

* packet_number: The packet number of the sent packet.

* is_ack_only: A boolean that indicates whether a packet only contains an
  ACK frame.  If true, it is still expected an ack will be received for
  this packet, but it is not congestion controlled.

* sent_bytes: The number of bytes sent in the packet, not including UDP or IP
  overhead, but including QUIC framing overhead.

Pseudocode for OnPacketSent follows:

~~~
 OnPacketSent(packet_number, is_ack_only, sent_bytes):
   time_of_last_sent_packet = now
   largest_sent_packet = packet_number
   sent_packets[packet_number].packet_number = packet_number
   sent_packets[packet_number].time = now
   if !is_ack_only:
     OnPacketSentCC(sent_bytes)
     sent_packets[packet_number].bytes = sent_bytes
     SetLossDetectionAlarm()
~~~

### On Ack Receipt

When an ack is received, it may acknowledge 0 or more packets.

Pseudocode for OnAckReceived and UpdateRtt follow:

~~~
   OnAckReceived(ack):
     largest_acked_packet = ack.largest_acked
     // If the largest acked is newly acked, update the RTT.
     if (sent_packets[ack.largest_acked]):
       latest_rtt = now - sent_packets[ack.largest_acked].time
       if (latest_rtt > ack.ack_delay):
         latest_rtt -= ack.delay
       UpdateRtt(latest_rtt)
     // Find all newly acked packets.
     for acked_packet in DetermineNewlyAckedPackets():
       OnPacketAcked(acked_packet.packet_number)

     DetectLostPackets(ack.largest_acked_packet)
     SetLossDetectionAlarm()


   UpdateRtt(latest_rtt):
     // Based on {{?RFC6298}}.
     if (smoothed_rtt == 0):
       smoothed_rtt = latest_rtt
       rttvar = latest_rtt / 2
     else:
       rttvar = 3/4 * rttvar + 1/4 * abs(smoothed_rtt - latest_rtt)
       smoothed_rtt = 7/8 * smoothed_rtt + 1/8 * latest_rtt
~~~

### On Packet Acknowledgment

When a packet is acked for the first time, the following OnPacketAcked function
is called.  Note that a single ACK frame may newly acknowledge several packets.
OnPacketAcked must be called once for each of these newly acked packets.

OnPacketAcked takes one parameter, acked_packet, which is the packet number of
the newly acked packet, and returns a list of packet numbers that are detected
as lost.

If this is the first acknowledgement following RTO, check if the smallest newly
acknowledged packet is one sent by the RTO, and if so, inform congestion control
of a verified RTO, similar to F-RTO {{?RFC5682}}

Pseudocode for OnPacketAcked follows:

~~~
   OnPacketAcked(acked_packet_number):
     OnPacketAckedCC(acked_packet_number)
     // If a packet sent prior to RTO was acked, then the RTO
     // was spurious.  Otherwise, inform congestion control.
     if (rto_count > 0 &&
         acked_packet_number > largest_sent_before_rto)
       OnRetransmissionTimeoutVerified()
     handshake_count = 0
     tlp_count = 0
     rto_count = 0
     sent_packets.remove(acked_packet_number)
~~~

### Setting the Loss Detection Alarm

QUIC loss detection uses a single alarm for all timer-based loss detection.  The
duration of the alarm is based on the alarm's mode, which is set in the packet
and timer events further below.  The function SetLossDetectionAlarm defined
below shows how the single timer is set based on the alarm mode.

#### Handshake Packets

The initial flight has no prior RTT sample.  A client SHOULD remember
the previous RTT it observed when resumption is attempted and use that for an
initial RTT value.  If no previous RTT is available, the initial RTT defaults
to 100ms.

Endpoints MUST retransmit handshake frames if not acknowledged within a
time limit. This time limit will start as the largest of twice the RTT value
and MinTLPTimeout.  Each consecutive handshake retransmission doubles the
time limit, until an acknowledgement is received.

Handshake frames may be cancelled by handshake state transitions.  In
particular, all non-protected frames SHOULD be no longer be transmitted once
packet protection is available.

When stateless rejects are in use, the connection is considered immediately
closed once a reject is sent, so no timer is set to retransmit the reject.

Version negotiation packets are always stateless, and MUST be sent once per
handshake packet that uses an unsupported QUIC version, and MAY be sent in
response to 0RTT packets.

#### Tail Loss Probe and Retransmission Timeout

Tail loss probes {{?LOSS-PROBE=I-D.dukkipati-tcpm-tcp-loss-probe}} and
retransmission timeouts {{?RFC6298}} are an alarm based mechanism to recover
from cases when there are outstanding retransmittable packets, but an
acknowledgement has not been received in a timely manner.

#### Early Retransmit

Early retransmit {{?RFC5827}} is implemented with a 1/4 RTT timer. It is
part of QUIC's time based loss detection, but is always enabled, even when
only packet reordering loss detection is enabled.

#### Pseudocode

Pseudocode for SetLossDetectionAlarm follows:

~~~
 SetLossDetectionAlarm():
    if (retransmittable packets are not outstanding):
      loss_detection_alarm.cancel()
      return

    if (handshake packets are outstanding):
      // Handshake retransmission alarm.
      if (smoothed_rtt == 0):
        alarm_duration = 2 * kDefaultInitialRtt
      else:
        alarm_duration = 2 * smoothed_rtt
      alarm_duration = max(alarm_duration, kMinTLPTimeout)
      alarm_duration = alarm_duration * (2 ^ handshake_count)
    else if (loss_time != 0):
      // Early retransmit timer or time loss detection.
      alarm_duration = loss_time - now
    else if (tlp_count < kMaxTLPs):
      // Tail Loss Probe
      if (retransmittable_packets_outstanding == 1):
        alarm_duration = 1.5 * smoothed_rtt + kDelayedAckTimeout
      else:
        alarm_duration = kMinTLPTimeout
      alarm_duration = max(alarm_duration, 2 * smoothed_rtt)
    else:
      // RTO alarm
      alarm_duration = smoothed_rtt + 4 * rttvar
      alarm_duration = max(alarm_duration, kMinRTOTimeout)
      alarm_duration = alarm_duration * (2 ^ rto_count)

    loss_detection_alarm.set(now + alarm_duration)
~~~

### On Alarm Firing

QUIC uses one loss recovery alarm, which when set, can be in one of several
modes.  When the alarm fires, the mode determines the action to be performed.

Pseudocode for OnLossDetectionAlarm follows:

~~~
   OnLossDetectionAlarm():
     if (handshake packets are outstanding):
       // Handshake retransmission alarm.
       RetransmitAllHandshakePackets()
       handshake_count++
     else if (loss_time != 0):
       // Early retransmit or Time Loss Detection
       DetectLostPackets(largest_acked_packet)
     else if (tlp_count < kMaxTLPs):
       // Tail Loss Probe.
       SendOnePacket()
       tlp_count++
     else:
       // RTO.
       if (rto_count == 0)
         largest_sent_before_rto = largest_sent_packet
       SendTwoPackets()
       rto_count++

     SetLossDetectionAlarm()
~~~

### Detecting Lost Packets

Packets in QUIC are only considered lost once a larger packet number is
acknowledged.  DetectLostPackets is called every time an ack is received.
If the loss detection alarm fires and the loss_time is set, the previous
largest acked packet is supplied.

#### Handshake Packets

The receiver MUST close the connection with an error of type OPTIMISTIC_ACK
when receiving an unprotected packet that acks protected packets.
The receiver MUST trust protected acks for unprotected packets, however.  Aside
from this, loss detection for handshake packets when an ack is processed is
identical to other packets.

#### Pseudocode

DetectLostPackets takes one parameter, acked, which is the largest acked packet.

Pseudocode for DetectLostPackets follows:

~~~
   DetectLostPackets(largest_acked):
     loss_time = 0
     lost_packets = {}
     delay_until_lost = infinite
     if (time_reordering_fraction != infinite):
       delay_until_lost =
         (1 + time_reordering_fraction) * max(latest_rtt, smoothed_rtt)
     else if (largest_acked.packet_number == largest_sent_packet):
       // Early retransmit alarm.
       delay_until_lost = 9/8 * max(latest_rtt, smoothed_rtt)
     foreach (unacked < largest_acked.packet_number):
       time_since_sent = now() - unacked.time_sent
       delta = largest_acked.packet_number - unacked.packet_number
       if (time_since_sent > delay_until_lost):
         lost_packets.insert(unacked)
       else if (delta > reordering_threshold)
         lost_packets.insert(unacked)
       else if (loss_time == 0 && delay_until_lost != infinite):
         loss_time = now() + delay_until_lost - time_since_sent

     // Inform the congestion controller of lost packets and
     // lets it decide whether to retransmit immediately.
     if (!lost_packets.empty())
       OnPacketsLost(lost_packets)
       foreach (packet in lost_packets)
         sent_packets.remove(packet.packet_number)
~~~

## Discussion
The majority of constants were derived from best common practices among widely
deployed TCP implementations on the internet.  Exceptions follow.

A shorter delayed ack time of 25ms was chosen because longer delayed acks can
delay loss recovery and for the small number of connections where less than
packet per 25ms is delivered, acking every packet is beneficial to congestion
control and loss recovery.

The default initial RTT of 100ms was chosen because it is slightly higher than
both the median and mean min_rtt typically observed on the public internet.


# Congestion Control

QUIC's congestion control is based on TCP NewReno{{?RFC6582}}
congestion control to determine the congestion window and
pacing rate.  QUIC congestion control is specified in bytes due to
finer control and the ease of appropriate byte counting{{?RFC3465}}.

## Slow Start

QUIC begins every connection in slow start and exits slow start upon
loss. QUIC re-enters slow start after a retransmission timeout.
While in slow start, QUIC increases the congestion window by the
number of acknowledged bytes when each ack is processed.

## Congestion Avoidance

Slow start exits to congestion avoidance.  Congestion avoidance in NewReno
uses an additive increase multiplicative decrease (AIMD) approach that
increases the congestion window by one MSS of bytes per congestion window
acknowledged.  When a loss is detected, NewReno halves the congestion
window and sets the slow start threshold to the new congestion window.

## Recovery Period

Recovery is a period of time beginning with detection of a lost packet.
Because QUIC retransmits stream data and control frames, not packets,
it defines the end of recovery as a packet sent after the start of
recovery being acknowledged.  This is slightly different from TCP's
definition of recovery ending when the lost packet that started
recovery is acknowledged.

During recovery, the congestion window is not increased or decreased.
As such, multiple lost packets only decrease the congestion window once as
long as they're lost before exiting recovery. This causes QUIC to decrease
the congestion window multiple times if retransmisions are lost, but limits
the reduction to once per round trip.

## Tail Loss Probe

If recovery sends a tail loss probe, no change is made to the congestion
window or pacing rate.  Acknowledgement or loss of tail loss probes are
treated like any other packet.

## Retransmission Timeout

When retransmissions are sent due to a retransmission timeout alarm, no
change is made to the congestion window or pacing rate until the next
acknowledgement arrives.  When an ack arrives, if packets prior to the first
retransmission timeout are acknowledged, then the congestion window
remains the same.  If no packets prior to the first retransmission timeout
are acknowledged, the retransmission timeout has been validated and the
congestion window must be reduced to the minimum congestion window and
slow start is begun.

## Pacing Rate

The pacing rate is a function of the mode, the congestion window, and
the smoothed rtt.  Specifically, the pacing rate is 2 times the
congestion window divided by the smoothed RTT during slow start
and 1.25 times the congestion window divided by the smoothed RTT during
congestion avoidance.  In order to fairly compete with flows that are not
pacing, it is recommended to not pace the first 10 sent packets when
exiting quiescence.

## Pseudocode

### Constants of interest

Constants used in congestion control are based on a combination of RFCs,
papers, and common practice.  Some may need to be changed or negotiated
in order to better suit a variety of environments.

kDefaultMss (default 1460 bytes):
: The default max packet size used for calculating default and minimum
  congestion windows.

kInitialWindow (default 10 * kDefaultMss):
: Default limit on the amount of outstanding data in bytes.

kMinimumWindow (default 2 * kDefaultMss):
: Default minimum congestion window.

kLossReductionFactor (default 0.5):
: Reduction in congestion window when a new loss event is detected.


### Variables of interest

Variables required to implement the congestion control mechanisms
are described in this section.

bytes_in_flight:
: The sum of the size in bytes of all sent packets that contain at least
  one retransmittable or PADDING frame, and have not been acked or
  declared lost. The size does not include IP or UDP overhead.
  Packets only containing ack frames do not count towards byte_in_flight
  to ensure congestion control does not impede congestion feedback.

congestion_window:
: Maximum number of bytes in flight that may be sent.

end_of_recovery:
: The largest packet number sent when QUIC detects a loss.  When a larger
  packet is acknowledged, QUIC exits recovery.

ssthresh
: Slow start threshold in bytes.  When the congestion window is below
  ssthresh, the mode is slow start and the window grows by the number of
  bytes acknowledged.

### Initialization

At the beginning of the connection, initialize the congestion control
variables as follows:

~~~
   congestion_window = kInitialWindow
   bytes_in_flight = 0
   end_of_recovery = 0
   ssthresh = infinite
~~~

### On Packet Sent

Whenever a packet is sent, and it contains non-ACK frames,
the packet increases bytes_in_flight.

~~~
   OnPacketSentCC(bytes_sent):
     bytes_in_flight += bytes_sent
~~~

### On Packet Acknowledgement

Invoked from loss detection's OnPacketAcked and is supplied with
acked_packet from sent_packets.

~~~
   OnPacketAckedCC(acked_packet):
     // Remove from bytes_in_flight.
     bytes_in_flight -= acked_packet.bytes
     if (acked_packet.packet_number < end_of_recovery):
       // Do not increase congestion window in recovery period.
       return
     if (congestion_window < ssthresh):
       // Slow start.
       congestion_window += acked_packets.bytes
     else:
       // Congestion avoidance.
       congestion_window +=
         kDefaultMss * acked_packets.bytes / congestion_window
~~~

### On Packets Lost

Invoked by loss detection from DetectLostPackets when new packets
are detected lost.

~~~
   OnPacketsLost(lost_packets):
     // Remove lost packets from bytes_in_flight.
     for (lost_packet : lost_packets):
       bytes_in_flight -= lost_packet.bytes
     largest_lost_packet = lost_packets.last()
     // Start a new recovery epoch if the lost packet is larger
     // than the end of the previous recovery epoch.
     if (end_of_recovery < largest_lost_packet.packet_number):
       end_of_recovery = largest_sent_packet
       congestion_window *= kLossReductionFactor
       congestion_window = max(congestion_window, kMinimumWindow)
       ssthresh = congestion_window
~~~

### On Retransmission Timeout Verified

QUIC decreases the congestion window to the minimum value once the
retransmission timeout has been verified.

~~~
   OnRetransmissionTimeoutVerified()
     congestion_window = kMinimumWindow
~~~

# IANA Considerations

This document has no IANA actions.  Yet.


--- back

# Acknowledgments


# Change Log

> **RFC Editor's Note:**  Please remove this section prior to
> publication of a final version of this document.

## Since draft-ietf-quic-recovery-06

Nothing yet.

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

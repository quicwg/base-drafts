# Contributing to QUIC base-drafts

The base-drafts repository is the home of the following QUIC Working Group documents:

* Invariants
* Transport
* TLS
* HTTP/3
* QPACK
* Recovery

**All of the documents have now passed IESG review stage. We will no longer consider Design changes or substantial Editorial changes unless they relate to severe security, interoperabily or deployment problems. See [Post-IESG Process](#post-iesg-process) below for further information** 

**Be aware that all contributions fall under the "NOTE WELL" terms outlined below.**


<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Following Discussion](#following-discussion)
- [Raising Issues](#raising-issues)
- [Resolving Issues](#resolving-issues)
- [Pull Requests](#pull-requests)
- [Code of Conduct](#code-of-conduct)
- [NOTE WELL](#note-well)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Engaging with the QUIC community

The QUIC Working Group scope of work is described in our charter and it extends beyond the development of the documents held in this repository. Anyone is welcome to contribute to the QUIC community; you don't have to join the Working Group, because there is no "membership" -- anyone who participates in the work **is** a part of the QUIC Working Group.

Before doing so, it's a good idea to familiarize yourself with our [charter](https://datatracker.ietf.org/wg/quic/about/). If you're new to IETF work, you may also want to read the [Tao of the IETF](https://www.ietf.org/tao.html).

## Following Discussion

The Working Group has a few venues for discussion:

* We plan to meet at all [IETF meetings](https://www.ietf.org/meeting/) for the foreseeable future, and possibly hold interim meetings between them if required. Agendas, minutes and presentations are available in our [meeting materials repository](https://github.com/quicwg/wg-materials) and the [official proceedings](https://datatracker.ietf.org/wg/quic/meetings/).

* Our [mailing list](https://www.ietf.org/mailman/listinfo/quic) is used for most communication, including notifications of meetings, new drafts, consensus calls and other business, as well as issue discussion.

* We also discuss specific issues on the appropriate issues list in [Github](https://github.com/quicwg/). If you don't want to use Github to follow these discussions, you can subscribe to the [issue announce list](https://www.ietf.org/mailman/listinfo/quic-issues).

To be active in the Working Group, you can participate in any of these places. Most activity takes
place on the mailing list, but if you just want to comment on and raise issues, that's fine too.


### Post-IESG Process

The Working Group has built consensus that is reflected in base-draft documents, which has been confirmed through the IETF Last Call and IESG review stages modulo any critical undiscovered issues. Design changes will no longer be considered unless there are severe security, deployment or implementation problems. modulo any open (or undiscovered) issues. The goal of the Post-IESG proces is to minimise changes that invalidate the accumulated consesus, which risks returning us to the pre Working Group Last Call stage of standardisation.

In this process, all required parties will discuss each design or major editorial issue and proposed resolution (ideally based upon a Pull Request that specifies the exact changes to be made). Chairs will judge consensus, labelling the issue as `has-consensus`.

### Raising Issues

We will no longer consider Design changes or substantial Editorial changes unless they relate to severe security, interoperabily or deployment problems.

We use our [Github](https://github.com/quicwg/) issues lists to track items for discussion and
their resolution.

Issues can also be raised on the [Working Group mailing
list](https://www.ietf.org/mailman/listinfo/quic) by clearly marking them as such (e.g., "New
Issue" in the `Subject:` line).

Be aware that issues might be rephrased, changed in scope, or combined with others, so that the
group can focus its efforts. If you feel that such a change loses an important part of your
original issue, please bring it up, either in comments or on the list.

Off-topic and duplicate issues will be closed without discussion. Note that comments on individual
commits will only be responded to with best effort, and may not be seen.


### Resolving Issues

Issues will be labeled by the Chairs as either `editorial` or `design`:

* **Design** issues require discussion and consensus among the Working Group, Area Director and IESG. This discussion can happen both in the issue and on the [Working Group mailing list](https://www.ietf.org/mailman/listinfo/quic), and all other relavent mailing lists.

* **Editorial** issues that or minor or unsubstantial can be dealt with by the editor(s) without consensus or notification. Larger editorial changes require discussion and and consensus among the Working Group, Area Director and IESG.

The open design issues in the issues list are those that we are currently discussing, or plan to discuss. They can be discussed on the mailing list or the issue itself.


### Pull Requests

We welcome pull requests, both for editorial suggestions and to resolve open issues. In the latter
case, please identify the relevant issue.

Please do not use a pull request to open a new design issue; it may not be noticed.


## Code of Conduct

The [IETF Guidelines for Conduct](https://tools.ietf.org/html/rfc7154) applies to all Working Group
communications and meetings.


## NOTE WELL

Any submission to the [IETF](https://www.ietf.org/) intended by the Contributor for publication as
all or part of an IETF Internet-Draft or RFC and any statement made within the context of an IETF
activity is considered an "IETF Contribution". Such statements include oral statements in IETF
sessions, as well as written and electronic communications made at any time or place, which are
addressed to:

 * The IETF plenary session
 * The IESG, or any member thereof on behalf of the IESG
 * Any IETF mailing list, including the IETF list itself, any working group
   or design team list, or any other list functioning under IETF auspices
 * Any IETF working group or portion thereof
 * Any Birds of a Feather (BOF) session
 * The IAB or any member thereof on behalf of the IAB
 * The RFC Editor or the Internet-Drafts function
 * All IETF Contributions are subject to the rules of
   [RFC 5378](https://tools.ietf.org/html/rfc5378) and
   [RFC 8179](https://tools.ietf.org/html/rfc8179).

Statements made outside of an IETF session, mailing list or other function, that are clearly not
intended to be input to an IETF activity, group or function, are not IETF Contributions in the
context of this notice.

Please consult [RFC 5378](https://tools.ietf.org/html/rfc5378) and [RFC 8179](https://tools.ietf.org/html/rfc8179) for details.

A participant in any IETF activity is deemed to accept all IETF rules of process, as documented in
Best Current Practices RFCs and IESG Statements.

A participant in any IETF activity acknowledges that written, audio and video records of meetings
may be made and may be available to the public.

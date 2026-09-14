# Transparent: live product feedback, 2026-09-14

Documentation-only review. No application code, wallet connection, game creation, game join, transaction, deployment or settings change was performed. Findings below describe public UI observations, not verified backend behavior.

## Evidence and scope

Tested https://transparent-five.vercel.app/ and its join page in a fresh browser session. The repository README identifies this as the live site; the deployed commit was not independently established.

## Mode selection clarity

Action: clicked storyteller on the landing page. The next accessibility snapshot showed the Free For All hero while keyboard focus remained on storyteller. The hero rotates, so this does not prove the click handler is broken. The controls do not expose a selected state in the accessibility snapshot.

Recommendation: distinguish a persistent chosen game mode from a rotating marketing preview. If the buttons only preview modes, label that purpose explicitly; if they select a mode, preserve and announce the choice.

Acceptance: activate each mode with mouse and keyboard; after two rotation intervals, the selected mode remains visibly and accessibly identifiable. Opening the create flow preserves that choice or clearly asks the player to choose.

## Join form accessibility and prerequisite clarity

Action: clicked join a game. The /join page rendered six code inputs, a handle input, CONNECT, and a disabled ape in button displaying 0.1 before a room code was entered. The accessibility snapshot gave the seven inputs no meaningful accessible names. A screenshot confirmed visible CODE and YOUR HANDLE headings, but these do not by themselves establish programmatic labels.

Recommendation: associate each field with a label (including digit position or a single paste-friendly code field). Explain why joining is disabled. Before room details are loaded, avoid presenting a default amount as if it is a confirmed room cost; clearly label any placeholder or estimate.

Acceptance: a screen reader announces Room code and digit positions plus Your handle; a complete code can be pasted; prerequisites and validation are announced; the displayed amount is confirmed from the selected room before any commitment.

## Activity claims

The landing displayed 1,284 live players, matching the earlier September 10/14 public observations. This alone does not establish whether data is live, cached or illustrative. Identify the source and refresh behavior; label sample activity if applicable. Acceptance: a reviewer can trace the displayed count to its documented source, and stale/sample states are unambiguous.

## Remaining validation

No authorized room code or authenticated wallet session was available for this bounded review. Gameplay, reconnect, deadlines, anonymity, host loss and settlement remain unverified. These are evidence gaps, not reproduced defects. Review sanitized multi-device evidence before claiming completion.

# When Cypress tests pass locally and fail in CI

Notes from a stretch of work where several end-to-end tests were reliably green on a
developer machine and reliably red in the build pipeline. Almost none of it turned out to be
a bug in the application. Most of it was how the tests were written.

These are the lessons worth passing on.

---

## The one thing behind most of it: CI is slower than your laptop

We measured the same tests running five to seven times slower in the pipeline than locally.
A test that takes 30 seconds on your machine can take three minutes there.

That changes what "passing" means. A test that passes locally with little room to spare is
already failing — you just can't see it yet. The pipeline has less room, so it sees it first.

**Lesson:** a local pass is not evidence a test is sound. Look at how long it takes and how
close it comes to its limits, not just whether it went green.

---

## Building test data

### Don't click through the UI to create bulk data

Our worst offenders spent minutes clicking the same form 26 and 30 times, just to produce
enough records for the thing they actually wanted to test. Every one of those steps was a
chance to fail, and in the pipeline one of them always did.

Ask what each UI step is *proving*. If a step is only there to produce data, write that data
straight to the database instead, and drive only the behaviour under test through the
browser. Two tests went from two minutes and eighty seconds down to seventeen and thirteen
seconds this way — and stopped failing.

### If you seed data, make it look real

Seeding is faster, but it is easy to create data that never occurs in practice, and then
your test proves nothing.

Two traps we hit:

- **Something else may overwrite what you insert.** A database rule quietly replaced every
  timestamp we supplied with the current time. All our records landed within the same
  millisecond instead of seconds apart. Real user actions are spread out in time; ours
  weren't, and the feature under test sorted by time.
- **Ties make order random.** Once those timestamps collided, the order fell back to a random
  internal id. The test then depended on luck. Space your values out so order is never
  ambiguous.

Before trusting seeded data, read back what actually landed in the database and compare it to
a real record.

### Know what your test helpers quietly do

Our shared helpers for creating records deliberately suppressed a category of side effect.
That cut both ways: we couldn't use them to produce the records we needed, and separately, it
was the only reason a later step didn't create an extra unwanted record.

Neither behaviour was visible at the call site. Read your helpers before relying on them, and
write down what they suppress.

---

## Interacting with the UI

### `{ force: true }` is not a "make it work" flag

It looks like a way to get past a stubborn click. What it actually does is switch off
Cypress's checks that the element is ready to be clicked — including the automatic retrying
that waits for things to settle.

Pop-up menus often keep an invisible backdrop on screen for a moment while they close. A
normal click waits that out. A forced click goes through immediately, hits the backdrop,
and does nothing at all. The test then fails further down, somewhere unrelated.

If a click needs forcing, find out what is in the way.

### Wait for the thing you depend on, not just the thing you want

One failure read "no menu options found". The real problem was that the menu never opened —
the click had been swallowed. The error pointed at the contents rather than the cause, and we
lost time looking in the wrong place.

Assert the precondition explicitly: that the previous menu has closed, and that the new one
has actually opened, before you look for anything inside it. Your failures will then name the
real problem.

### Raising a timeout for a heavy test is legitimate

Default timeouts are usually set for quick, light tests. A data-heavy screen in a slow
pipeline may genuinely need longer.

Raising a timeout raises a *ceiling*; it does not add a delay. Cypress still continues the
moment the condition is met, so fast runs stay fast — our local time was unchanged. It also
doesn't weaken the assertion; the check is identical, it just gets long enough to observe a
slower page.

Do it for the specific test that needs it, not globally, and say why in a comment.

---

## Reading failures properly

### Same error every time means a bug. Different errors mean timing

This was the single most useful diagnostic we had.

- Identical failure, same place, every retry → a real defect. Reproduce it and fix it.
- Different failure points on each retry → a timing or environment problem. Don't go hunting
  through application code.

We wasted effort treating the second kind as the first, and nearly shipped a fix for
something that was never broken.

### Retries hide fragility — read them

If a test passes on its fourth attempt, it failed three times. That is not a pass; it is a
warning that it will fail in a slower environment.

Check the retry count, not just the final result.

### A "green" run may not have run

Some setups stop everything after the first failure and report the remainder as skipped. In
our reporter those skipped tests appeared with tick marks and a suspiciously short duration,
and the summary looked almost entirely green when in reality only a handful had run.

Learn how your reporter displays skipped tests. A run that finishes in milliseconds didn't
test anything. Check the number that actually *passed*, not the number of ticks.

Related: if you pipe test output through another command to shorten it, you may end up
reading the success or failure of that command instead of the tests. Save the output and
read the summary.

### Get the real data before theorising

When a test failed on ordering, we spent a long time reasoning about what the data *should*
have been. Printing the records the test had actually created answered it in one run — and
showed our assumptions were right about the contents and wrong about the timestamps.

When something doesn't add up, print the actual state. It is almost always quicker than
another round of guessing.

---

## Before you change a test

### Reproduce the failure first

We applied a fix to a second test that looked like it had the same problem as the first. It
didn't. The fix broke a test that had been working, and we reverted it.

If you can't make it fail, you can't know you fixed it. A fix applied on suspicion is a
change with no evidence behind it.

### If the same code passes elsewhere, the code isn't the problem

Several times we could compare against another build running the identical test and identical
application code. When it passed there, that ruled out the code and pointed straight at the
environment — a stale database, a slow machine, load from other work.

Find a comparison point before digging into application code.

---

## Quick checklist

Before you commit an end-to-end test:

- [ ] How long does it take? If it's among your slowest, it will be the first to fail in CI.
- [ ] Does any UI step exist purely to create data? Seed it instead.
- [ ] If you seeded data, did you read it back and compare it to a real record?
- [ ] Any `{ force: true }` you can't justify?
- [ ] Do you assert that menus and dialogs actually opened, before looking inside them?
- [ ] Did it pass first time, or on a retry?
- [ ] Run it several times in a row. Only a consistent first-attempt pass counts.

And when one fails in CI but not locally, work in this order: check the retries for a pattern,
find a comparison run with the same code, print the real data, and only then change anything.

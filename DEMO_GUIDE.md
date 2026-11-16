# A five-minute QueueFlow demonstration

Start the app and choose **Try the live demo**. Explain that this is a private
practice campus with fictional visitors, separate from real student accounts.

## Student side

1. Read the three-step walkthrough. Close it to see the service directory.
2. Open Library services: joining is disabled because the service is paused.
3. Open Academic office. Point out the location, required documents and wait range.
4. Enter a short visit reason and choose **Get my token**.
5. My visit shows AC-048, six people ahead and position seven in a fresh demo.
6. Refresh the page. The same saved visit returns.

The initial example has AC-042 in service and AC-043 to AC-047 waiting. The newly
joined student takes AC-048. Daily sequence numbers are not the same as position.

## Staff side

1. Click **Second tab**. It opens this workspace as staff while keeping the
   original tab as the student.
2. Choose Academic office from the native service dropdown.
3. Complete AC-042. The student's position changes from seven to six automatically.
4. Choose **Call next visitor**. AC-043 is called in FIFO order.
5. Point out that **Mark as missed** is disabled until the arrival window ends.
6. When the visitor is present, choose **Start visit**, then **Complete visit**.

To show the missed-turn path, call another token and wait for the 15-second
practice window. Mark the visitor missed. In regular use the window is two
minutes, and the returning student must join again at the end.

## Management and records

- Open Visit history. Filter by service/status and search for a token.
- Export all visits as CSV. Student history shows only that student's own visits.
- In Manage services, create a service with its location, prefix, average and
  capacity. Edit it, pause it, then close joins. An empty closed service can be
  archived while retaining its history.
- Open Counter display. It shows tokens and locations without visitor names.

## Return to the student

Use the original tab. Open **My visit**, then **Leave queue**. First choose
**Keep my place** to demonstrate the confirmation. Repeat and confirm leaving;
the token moves into history as cancelled. The student can join another service.

## Restart the walkthrough

Open the account menu and choose **Reset practice visits**. It affects only this
practice workspace. Edited service details and archived services remain as they
are. Choose Student view and begin again, or leave practice and start a fresh demo
for a completely new campus.

## Points to explain in the viva

- A React action sends a REST request to Express; the server validates permissions
  and changes SQLite records in a transaction.
- A partial unique index prevents a student from holding two active visits.
- Queue versions prevent an old staff window from replacing a newer action.
- Idempotency keys make a repeated request return its original result.
- Socket.IO sends a change notice; each client fetches its permitted view again.
- Wait ranges are estimates. No paid messaging service is used.

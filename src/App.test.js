import { act } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import App from "./App";

const selectCustomer = (partyId) => {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://racv--iagiqa--c.sandbox.vf.force.com",
        data: {
          gwMessageType: "CUSTOMER_SELECTED",
          gwMessageId: "m-1",
          Name: "Alex Customer",
          gwPayload: { partyId },
        },
      })
    );
  });
};

const loadPaymentIframe = () => {
  fireEvent.load(screen.getByTitle("Payment Iframe"));
};

const rowText = (label) =>
  screen.getByText(`${label}:`, { selector: "strong" }).parentElement.textContent;

test("loads the payment iframe only after a valid submit and reads the url back", () => {
  render(<App />);

  expect(screen.getByTitle("Search Iframe")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();
  expect(screen.getByLabelText("amount")).toHaveValue("117816");
  expect(screen.queryByLabelText("sessionId")).not.toBeInTheDocument();
  expect(screen.getByLabelText("customerId")).toHaveValue("");
  expect(screen.getByText("No data received yet...")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(screen.getByText("Select a customer from the search results.")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("amount"), {
    target: { name: "amount", value: "12.5" },
  });
  selectCustomer("PARTY-123");

  expect(screen.getByLabelText("customerId")).toHaveValue("PARTY-123");
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(screen.getByText("amount must be a whole number of cents greater than zero.")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("amount"), {
    target: { name: "amount", value: "117816" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  const paymentIframe = screen.getByTitle("Payment Iframe");
  const iframeUrl = paymentIframe.getAttribute("src");

  expect(iframeUrl).toContain("customerId=PARTY-123");
  expect(iframeUrl).toContain("amount=117816");
  expect(iframeUrl).toContain("id=PARTY-123");
  expect(iframeUrl).toContain("brand=RACV");
  expect(iframeUrl).toContain("sessionId=774544f2-15a9-4bff-b8c8-78d5aac0bdad");
  expect(screen.getByText("Waiting for the payment iframe to load...")).toBeInTheDocument();

  loadPaymentIframe();

  expect(rowText("amount")).toContain("117816");
  expect(rowText("customerId")).toContain("PARTY-123");
  expect(rowText("id")).toContain("PARTY-123");
  expect(
    screen.getByText("Iframe URL:", { selector: "strong" }).parentElement.textContent
  ).toContain("ExternalCustomerPaymentVF");

  fireEvent.change(screen.getByLabelText("amount"), {
    target: { name: "amount", value: "999" },
  });

  expect(screen.getByLabelText("amount")).toHaveValue("999");
  expect(rowText("amount")).toContain("117816");
  expect(rowText("amount")).not.toContain("999");
});

test("rejects an invalid expiry and currency before rendering the payment iframe", () => {
  render(<App />);
  selectCustomer("PARTY-456");

  fireEvent.change(screen.getByLabelText("expiry"), {
    target: { name: "expiry", value: "08-10-2026" },
  });
  fireEvent.change(screen.getByLabelText("currency"), {
    target: { name: "currency", value: "aud" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(
    screen.getByText("expiry must be an ISO-8601 UTC timestamp, for example 2026-10-08T00:03:13.974Z.")
  ).toBeInTheDocument();
  expect(screen.getByText("currency must be a 3-letter code such as AUD.")).toBeInTheDocument();
  expect(screen.queryByTitle("Payment Iframe")).not.toBeInTheDocument();
  expect(within(screen.getByRole("alert")).getByText(/Fix the highlighted fields/)).toBeInTheDocument();
});

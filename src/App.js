import React, { useEffect, useRef, useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Card,
  CardContent,
  Paper,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import PaymentRequestForm from "./PaymentRequestForm";

const readIframePayload = (iframeUrl) => {
  const params = new URL(iframeUrl).searchParams;
  const captured = {};

  params.forEach((value, key) => {
    captured[key] = value;
  });

  return captured;
};

function App() {
  const [sfData, setSfData] = useState(null);
  const [cashEntryName, setCashEntryName] = useState(null);
  const [paymentIframeLoaded, setPaymentIframeLoaded] = useState(false);
  const [paymentDismissed, setPaymentDismissed] = useState(false);
  const [showLeavePaymentDialog, setShowLeavePaymentDialog] = useState(false);
  const [paymentIframeSrc, setPaymentIframeSrc] = useState("");
  const [paymentLoadId, setPaymentLoadId] = useState(0);
  const [capturedIframeUrl, setCapturedIframeUrl] = useState("");
  const [capturedPayload, setCapturedPayload] = useState(null);

  const paymentIframeContainerRef = useRef(null);
  const paymentIframeRef = useRef(null);

  const partyId = sfData?.gwPayload?.partyId || "";

  const isPaymentActive =
    Boolean(paymentIframeSrc) && paymentIframeLoaded && !paymentDismissed;

  useEffect(() => {
    setCashEntryName(null);
    setPaymentIframeLoaded(false);
    setPaymentDismissed(false);
    setShowLeavePaymentDialog(false);
    setPaymentIframeSrc("");
    setCapturedIframeUrl("");
    setCapturedPayload(null);
  }, [partyId]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.origin.includes("sandbox.vf.force.com")) return;

      const data = event.data;

      if (data === null) {
        setSfData(null);
        setCashEntryName(null);
        return;
      }

      if (
        typeof data !== "object" ||
        data === null ||
        typeof data.gwMessageType === "undefined"
      ) {
        console.warn("Invalid message received:", data);
        return;
      }

      const entryName = data.gwPayload?.cashEntryName;

      if (entryName) {
        setCashEntryName(entryName);
        return;
      }

      setSfData(data);
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!isPaymentActive) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (showLeavePaymentDialog) {
        return;
      }

      if (
        paymentIframeContainerRef.current &&
        !paymentIframeContainerRef.current.contains(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setShowLeavePaymentDialog(true);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick, true);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick, true);
    };
  }, [isPaymentActive, showLeavePaymentDialog]);

  const focusPaymentIframe = () => {
    paymentIframeRef.current?.focus();
    try {
      paymentIframeRef.current?.contentWindow?.focus();
    } catch (error) {
      console.warn("Unable to focus payment iframe:", error);
    }
  };

  const handleConfirmLeavePayment = () => {
    setShowLeavePaymentDialog(false);
    setPaymentDismissed(true);
  };

  const handleCancelLeavePayment = () => {
    setShowLeavePaymentDialog(false);
    focusPaymentIframe();
  };

  const handleValidPaymentRequest = (paymentUrl) => {
    setCapturedIframeUrl("");
    setCapturedPayload(null);
    setPaymentIframeLoaded(false);
    setPaymentDismissed(false);
    setShowLeavePaymentDialog(false);
    setCashEntryName(null);
    setPaymentLoadId((current) => current + 1);
    setPaymentIframeSrc(paymentUrl);
  };

  const handlePaymentIframeLoad = (event) => {
    const iframeUrl = event.currentTarget.src;
    setPaymentIframeLoaded(true);
    setCapturedIframeUrl(iframeUrl);
    setCapturedPayload(readIframePayload(iframeUrl));
  };

  const capturedEntries = capturedPayload ? Object.entries(capturedPayload) : [];

  return (
    <Box sx={{ backgroundColor: "#f4f6f8", minHeight: "100vh" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, textAlign: "center" }}>
            IAG POC - Salesforce Integration with I frame
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, pb: 4 }}>
        <Paper
          elevation={4}
          sx={{
            padding: 3,
            borderRadius: 3,
            mb: 4,
            backgroundColor: "#ffffff",
          }}
        >
          <Typography variant="h6" gutterBottom align="center">
            {sfData ? "Customer Found - Proceed to Payment" : "Search for a Customer"}
          </Typography>

          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 1 }}>
                Search Customer
              </Typography>
              <Box
                sx={{
                  border: "2px solid #1976d2",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <iframe
                  src="https://racv--iagiqa--c.sandbox.vf.force.com/apex/ExternalCustomerManagerVF"
                  width="100%"
                  height="500px"
                  style={{ border: "none" }}
                  title="Search Iframe"
                />
              </Box>
            </Grid>

            <Grid item xs={12}>
              <PaymentRequestForm
                partyId={partyId}
                showMissingPartyAlert={Boolean(sfData) && !partyId}
                onValidSubmit={handleValidPaymentRequest}
              />
            </Grid>

            {paymentDismissed && (
              <Grid item xs={12}>
                <Alert severity="warning">
                  Payment was closed. Submit the form again to reload the payment iframe.
                </Alert>
              </Grid>
            )}

            {paymentIframeSrc && !paymentDismissed && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 1 }}>
                  Payment Setup{sfData?.Name ? ` for ${sfData.Name}` : ""}
                </Typography>
                <Box
                  ref={paymentIframeContainerRef}
                  sx={{
                    border: "2px solid #2e7d32",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <iframe
                    key={paymentLoadId}
                    ref={paymentIframeRef}
                    src={paymentIframeSrc}
                    width="100%"
                    height="550px"
                    style={{ border: "none" }}
                    title="Payment Iframe"
                    tabIndex={0}
                    onLoad={handlePaymentIframeLoad}
                  />
                </Box>
              </Grid>
            )}

            {cashEntryName && (
              <Grid item xs={12}>
                <Card elevation={3} sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Typography>
                      Cash entry created: <strong>{cashEntryName}</strong>
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </Paper>

        <Card elevation={3} sx={{ borderRadius: 3, mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Data Received From Iframe URL
            </Typography>

            {capturedPayload ? (
              <>
                <Typography
                  variant="body2"
                  sx={{ mb: 2, wordBreak: "break-all" }}
                >
                  <strong>Iframe URL:</strong> {capturedIframeUrl}
                </Typography>
                <Grid container spacing={2}>
                  {capturedEntries.map(([key, value]) => (
                    <Grid item xs={12} sm={6} key={key}>
                      <Typography>
                        <strong>{key}:</strong> {value || "Missing from iframe URL"}
                      </Typography>
                    </Grid>
                  ))}
                </Grid>
              </>
            ) : (
              <Typography color="text.secondary">
                {paymentIframeSrc && !paymentDismissed
                  ? "Waiting for the payment iframe to load..."
                  : "No data received yet..."}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Container>

      <Dialog
        open={showLeavePaymentDialog}
        onClose={handleCancelLeavePayment}
        aria-labelledby="leave-payment-dialog-title"
      >
        <DialogTitle id="leave-payment-dialog-title">
          Payment In Progress
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Do not allow other operations while a payment is in progress.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2 }}>
            Are you sure you want to do something else?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelLeavePayment} color="primary" variant="contained">
            No
          </Button>
          <Button onClick={handleConfirmLeavePayment} color="warning" variant="outlined">
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;

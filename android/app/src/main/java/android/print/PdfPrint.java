package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * Writes what a WebView would print straight into a PDF file, without opening Android's print screen.
 * It lives in the android.print package on purpose: the layout and write callbacks can only be created from there.
 * Call it on the main thread.
 */
public class PdfPrint {
    public interface Done {
        void ok(File file);

        void fail(String message);
    }

    public static void write(final PrintDocumentAdapter adapter, final PrintAttributes attrs, final File file, final Done done) {
        adapter.onLayout(null, attrs, new CancellationSignal(), new PrintDocumentAdapter.LayoutResultCallback() {
            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                try {
                    final ParcelFileDescriptor fd = ParcelFileDescriptor.open(file,
                            ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE);
                    adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, fd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
                        @Override
                        public void onWriteFinished(PageRange[] pages) {
                            try { fd.close(); } catch (Exception ignored) { }
                            adapter.onFinish();
                            done.ok(file);
                        }

                        @Override
                        public void onWriteFailed(CharSequence error) {
                            try { fd.close(); } catch (Exception ignored) { }
                            adapter.onFinish();
                            done.fail(error == null ? "the PDF could not be written" : error.toString());
                        }
                    });
                } catch (Exception e) {
                    done.fail(e.getMessage());
                }
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                done.fail(error == null ? "the page could not be laid out" : error.toString());
            }
        }, null);
    }
}

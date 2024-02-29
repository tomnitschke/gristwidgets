# ViewerJS Grist Widget
A simple [Grist](https://www.getgrist.com/) widget using the amazing [viewerJS](https://viewerjs.org/) component that allows you to view PDF and ODT/ODF files directly in your browser.

To use, create a custom widget in your Grist document and set its URL to `https://tomnitschke.github.io/gristwidgets/viewerjs`.  
You'll need to map an 'Integer' type column to it that provides the Grist attachment ID of the file to be displayed. As an example of how to obtain that ID, supposing you have your attachments in a column 'documents', add a formula column with type 'Integer' and put this into it:
```
return $documents.id[0]
```
Alternatively, you could look for a file by filename, across *all* of your document's attachment columns. In that case, make a formula column like above but use this formula:
```
def get_attachment_by_filename(filename)
  return _grist_Attachments.lookupOne(fileName=filename) or None

return get_attachment_by_filename("whichever_image_youre_looking_to_insert.jpg").id
```

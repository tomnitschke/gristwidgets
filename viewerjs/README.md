# ViewerJS Grist Widget
A simple [Grist](https://www.getgrist.com/) widget using the amazing [viewerJS](https://viewerjs.org/) component that allows you to view PDF and ODT/ODF files directly in your browser.

To use, create a custom widget in your Grist document and set its URL to `https://tomnitschke.github.io/gristwidgets/viewerjs`.  
You'll need to map an 'Integer' type column to it that provides the Grist attachment ID of the file to be displayed.  

How do you obtain an attachment ID? Supposing you have your attachments in a column 'documents', you could just add a formula column with type 'Integer' and put this into it:
```
# Get the attachment ID of the first file in the 'documents' column.
# Use $documents.id[-1] if you want the last file instead.
return $documents.id[0]

# You could also consider all files added in the 'documents' column and filter them by filename:
for attachment in $documents:
  if attachment.fileName == "whichever_file_name_youre_looking_for.png":
    return attachment.id
# If we couldn't find the attachment we were looking for, raise an error.
raise ValueError("Requested attachment not found.")
```
Alternatively, you could look for a file by filename across *all* of your document's attachment columns. In that case, make a formula column like above but use this formula:
```
def get_attachment_by_filename(filename)
  return _grist_Attachments.lookupOne(fileName=filename) or None

return get_attachment_by_filename("whichever_image_youre_looking_to_insert.jpg").id
```

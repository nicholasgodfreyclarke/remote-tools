# Remote Tools

An extension to  
* Execute sas code remotely on the unix server (through an interactive ssh connection).
* Bring results down into excel for inspection/analysis.

Note: BigQuery support is experimental at this stage.

## Useful commands

Open the Command Palette (Ctrl+Shift+P on Windows) and type in one of the following commands:

| Command | Description |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Remote Tools: Execute Sas Code` | Execute the selected SAS code. Established the connection when first executed.|
| `Remote Tools: View 500 rows SAS` | Open the first 500 rows of the selected dataset in excel. |
| `Remote Tools: View all rows SAS` | Open all rows of the selected dataset in excel. Use caution with large datasets. |
| `Remote Tools: Query Big Query` | Open the results of the selected query in excel. |

To see all available commands, open the Command Palette and type `Remote Tools`.


## Extension Settings

This extension contributes the following settings:

- `RemoteTools.host`: hostname of the remote server running SAS
- `RemoteTools.port`: SSH port of the remote server running SAS
- `RemoteTools.username`: ssh username
- `RemoteTools.password`: ssh password
- `RemoteTools.noterminal`: -noterminal stops SAS from attempting to connect to the X server with using proc export.
 However, there is a side effect in that if there is an error in a data proc it is unable to recover until SAS is restarted.


## Known Issues

* With `-noterminal = false` proc export/import does not work. With `-noterminal = true` proc export and proc import will work but if SAS encounters an error in a data proc the session will have to be restarted.
* BigQuery authentication is cumbersom - currently requires running `gcloud auth application-default login` before starting the session.
* Some BigQuery field types do not have parsers implemented yet. 

## Release Notes

Users appreciate release notes as you update your extension.

### 0.0.1

Initial release

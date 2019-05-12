function isSharedDriveEmpty_(sharedDrive: string, notEmptyOverride: boolean): boolean
{
	if(notEmptyOverride)
	{
		return true;
	}
	const response = Drive.Files!.list({
		includeItemsFromAllDrives: true,
		maxResults: 1,
		q: '"' + sharedDrive + '" in parents and trashed = false',
		supportsAllDrives: true,
		fields: 'items(id)'
	});
	return response.items!.length === 0;
}

function moveFile_(file: string, source: string, destination: string): void
{
	Drive.Files!.update({}, file, null, {addParents: destination, removeParents: source, supportsAllDrives: true, fields: ''});
}

function copyFileComments_(source: string, destination: string): void
{
	let comments = [];
	let pageToken = null;
	do {
		const response: GoogleAppsScript.Drive.Schema.CommentList = Drive.Comments!.list(source, {
			maxResults: 100,
			pageToken: pageToken,
			fields: 'nextPageToken, items(author(isAuthenticatedUser, displayName), content, status, context, anchor, replies(author(isAuthenticatedUser, displayName), content, verb))'
		});
		for(let comment of response.items!)
		{
			comments.push(comment);
		}
		pageToken = response.nextPageToken;
	} while (pageToken !== undefined);
	Logger.log(comments);
	for(let comment of comments)
	{
		if(!comment.author!.isAuthenticatedUser)
		{
			comment.content = '*' + comment.author!.displayName + ':*\n' + comment.content;
		}
		let replies = comment.replies!;
		delete comment.replies;
		const commentId = Drive.Comments!.insert(comment, destination).commentId!;
		for(let reply of replies)
		{
			if(!reply.author!.isAuthenticatedUser)
			{
				reply.content = '*' + reply.author!.displayName + ':*\n' + reply.content;
			}
			Drive.Replies!.insert(reply, destination, commentId);
		}
	}
}

function deleteFile_(file: string): void
{
	const record = Drive.Files!.get(file, {fields: 'capabilities'});
	Logger.log(record);
	if(true || record.capabilities!.canTrash)
	{
		Drive.Files!.trash(file);
	}
}

function moveFileByCopy_(file: string, name: string, destination: string, copyComments: boolean, deleteOriginals: boolean): void
{
	const copy = Drive.Files!.copy({parents: [{id: destination}], title: name}, file, {supportsAllDrives: true, fields: 'id'});
	if(copyComments)
	{
		copyFileComments_(file, copy.id!);
	}
	if(deleteOriginals)
	{
		deleteFile_(file);
	}
}

function moveFolderContentsFiles_(source: string, destination: string, copyComments: boolean, deleteOriginals: boolean): void
{
	let files = [];
	let pageToken = null;
	do
	{
		const response: GoogleAppsScript.Drive.Schema.FileList = Drive.Files!.list({
			q: '"' + source + '" in parents and mimeType != "application/vnd.google-apps.folder" and trashed = false',
			pageToken: pageToken,
			maxResults: 1000,
			fields: 'nextPageToken, items(id, title, capabilities(canMoveItemOutOfDrive))'
		});
		for(let item of response.items!)
		{
			// @ts-ignore
			files.push({id: item.id, name: item.title, canMove: item.capabilities!.canMoveItemOutOfDrive});
		}
		pageToken = response.nextPageToken;
	} while (pageToken !== undefined);
	for(let file of files)
	{
		if(file.canMove)
		{
			moveFile_(file.id!, source, destination);
		}
		else
		{
			moveFileByCopy_(file.id!, file.name!, destination, copyComments, deleteOriginals);
		}
	}
}

function deleteFolderIfEmpty_(folder: string): void
{
	// TODO
}

function moveFolderContentsFolders_(source: string, destination: string, copyComments: boolean, deleteOriginals: boolean): void
{
	let folders = [];
	let pageToken = null;
	do
	{
		const response: GoogleAppsScript.Drive.Schema.FileList = Drive.Files!.list({
			q: '"' + source + '" in parents and mimeType = "application/vnd.google-apps.folder" and trashed = false',
			pageToken: pageToken,
			maxResults: 1000,
			fields: 'nextPageToken, items(id, title)'
		});
		for(let item of response.items!)
		{
			folders.push({id: item.id, name: item.title});
		}
		pageToken = response.nextPageToken;
	} while (pageToken !== undefined);
	for(let folder of folders)
	{
		const newFolder = Drive.Files!.insert({parents: [{id: destination}], title: folder.name, mimeType: 'application/vnd.google-apps.folder'}, undefined, {supportsAllDrives: true, fields: 'id'});
		moveFolderContents_(folder.id!, newFolder.id!, copyComments, deleteOriginals); // eslint-disable-line @typescript-eslint/no-use-before-define
		deleteFolderIfEmpty_(folder.id!);
	}
}

function moveFolderContents_(source: string, destination: string, copyComments: boolean, deleteOriginals: boolean): void
{
	moveFolderContentsFiles_(source, destination, copyComments, deleteOriginals);
	moveFolderContentsFolders_(source, destination, copyComments, deleteOriginals);
}

global.start = function(folder: string, sharedDrive: string, copyComments: boolean, deleteOriginals: boolean, notEmptyOverride: boolean): MoveResponse
{
	if(!isSharedDriveEmpty_(sharedDrive, notEmptyOverride))
	{
		return {status: 'error', reason: 'notEmpty'};
	}
	moveFolderContents_(folder, sharedDrive, copyComments, deleteOriginals);
	return {status: 'success'};
}

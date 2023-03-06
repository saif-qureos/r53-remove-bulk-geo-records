const { Route53 } = require("@aws-sdk/client-route-53");
const route53 = new Route53({ region: 'eu-east-1' });
const core = require('@actions/core');

async function deleteRecords(domainName, loadBalancerDns, route53HostedZoneId) {

  const records = await getRecordsByDomainName(domainName, route53HostedZoneId);
  console.log(`Fetched ${records.length} records for ${domainName}`);
  console.log(records);
  const recordsToDelete = records.filter(record => {
    const isDefaultRecord = record.Type === 'A' && record.Name === domainName && record.GeoLocation.CountryCode == '*';
    const isGeoRecord = record.Type === 'A' && record.AliasTarget && record.AliasTarget.DNSName === loadBalancerDns && (record.GeoLocation.ContinentCode || record.GeoLocation.CountryCode);
    return isGeoRecord && !isDefaultRecord;
  });

  if (recordsToDelete.length > 0) {
    console.log(recordsToDelete);
    console.log(`Deleting ${recordsToDelete.length} records for ${domainName}`);
  } else {
    console.log("No Records to delete... Exiting...")
  }

  // This code will first check if the record is the default record (the one with the domain name) and ignore it. For other records, it will check if they are geolocation records and include them only if they are not the default record.
  await Promise.all(recordsToDelete.map(record => deleteRecord(route53HostedZoneId, record)));

}

async function deleteRecord(route53HostedZoneId, record) {
  const deleteParams = {
    HostedZoneId: route53HostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: 'DELETE',
          ResourceRecordSet: record,
        },
      ],
    },
  };
  await route53.changeResourceRecordSets(deleteParams);
}

async function getRecordsByDomainName(domainName, route53HostedZoneId) {
  const listParams = {
    HostedZoneId: route53HostedZoneId,
    StartRecordName: domainName,
    StartRecordType: 'A',
  };
  let records = [];

  do {
    const res = await new Promise((resolve, reject) => {
      route53.listResourceRecordSets(listParams, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    records = records.concat(res.ResourceRecordSets);
    listParams.NextRecordName = res.NextRecordName;
    listParams.NextRecordType = res.NextRecordType;
  } while (listParams.NextRecordName && listParams.NextRecordType);
  // filter records to only include the ones with the specific domain name
  records = records.filter(record => record.Name === domainName);
  return records;
}




async function run() {

  const route53HostedZoneId = core.getInput("route53-hosted-zone-id", { required: true });
  const domainName = core.getInput("domain-name", { required: true }).toLowerCase();
  const loadBalancerDns = core.getInput("load-balancer-dns", { required: true }).toLowerCase();

  await deleteRecords(domainName, loadBalancerDns, route53HostedZoneId);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

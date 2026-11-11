<Content title="Which services does the app need?">
  <Lane>
    <Row width="third">
      <Box center color="gold" name="Gateway" tags={['Routing', 'Login', 'Limits']} />
    </Row>
    <Connector to={3} label="HTTPS" />
    <Row>
      <Box center color="steel" name="Accounts" tags={['Users', 'Roles']} />
      <Box center color="teal" name="Orders" tags={['Cart', 'Payment']} />
      <Box center color="violet" name="Messages" tags={['E-mail', 'Push']} />
    </Row>
  </Lane>
</Content>
